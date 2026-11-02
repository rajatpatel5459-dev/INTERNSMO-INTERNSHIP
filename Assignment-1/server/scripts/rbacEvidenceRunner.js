const mongoose = require('mongoose');
const net = require('node:net');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ioClient = require(require.resolve('socket.io-client', {
  paths: [path.resolve(__dirname, '..', '..', 'client')],
}));
const User = require('../models/User');
const Track = require('../models/Track');
const { loadAssetTracks } = require('../seed');

const mongoUri = 'mongodb://127.0.0.1:27017/spotify_rbac_test';
const jwtSecret = crypto.randomBytes(48).toString('hex');
const results = [];
const sockets = [];
let serverProcess;
let ownsTestDatabase = false;
let serverLogs = '';

function roleName(key) {
  return key === 'codj' ? 'Co-DJ (lounge-scoped)' : `${key[0].toUpperCase()}${key.slice(1)}`;
}

function record(role, endpoint, expected, actual, detail = '') {
  const isExpected = Array.isArray(expected) ? expected.includes(actual) : expected === actual;
  const result = isExpected ? 'PASS' : 'FAIL';
  results.push({
    role,
    endpoint,
    expected: Array.isArray(expected) ? expected.join(' or ') : expected,
    actual,
    result,
    detail,
  });
  if (result !== 'PASS') throw new Error(`${role} ${endpoint}: expected ${expected}, got ${actual}`);
}

async function findAvailablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function request(baseUrl, token, method, route, body) {
  const isForm = body instanceof FormData;
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

function recordHttp(role, endpoint, expected, response) {
  record(role, endpoint, expected, response.status, response.data?.message || '');
  return response;
}

function socketRequest(socket, event, emitName, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onSuccess);
      socket.off('error', onError);
      reject(new Error(`Timed out waiting for Socket.IO ${event}`));
    }, 4000);
    const finish = (result) => {
      clearTimeout(timer);
      socket.off(event, onSuccess);
      socket.off('error', onError);
      resolve(result);
    };
    const onSuccess = (value) => finish({ kind: event, value });
    const onError = (value) => finish({ kind: 'error', value });
    socket.once(event, onSuccess);
    socket.once('error', onError);
    socket.emit(emitName, payload);
  });
}

function socketRequestThrough(observer, emitter, event, emitName, payload, matches = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.off(event, onSuccess);
      reject(new Error(`Timed out waiting for Socket.IO ${event}`));
    }, 4000);
    const onSuccess = (value) => {
      if (!matches(value)) {
        observer.once(event, onSuccess);
        return;
      }
      clearTimeout(timer);
      observer.off(event, onSuccess);
      resolve(value);
    };
    observer.once(event, onSuccess);
    emitter.emit(emitName, payload);
  });
}

async function run() {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
  for (const collection of await mongoose.connection.db.listCollections().toArray()) {
    if (await mongoose.connection.db.collection(collection.name).countDocuments()) {
      throw new Error(`Refusing to use non-empty test collection ${collection.name}.`);
    }
  }
  ownsTestDatabase = true;

  const specs = [
    ['listener', 'listener@test.com', 'listener'],
    ['codj', 'codj@test.com', 'listener'],
    ['host', 'host@test.com', 'host'],
    ['admin', 'admin@test.com', 'admin'],
    ['outsider', 'outsider@test.com', 'listener'],
    ['guest', 'guest@test.com', 'listener'],
  ];
  const users = {};
  for (const [key, email, role] of specs) {
    users[key] = await User.create({
      displayName: `${key} RBAC`,
      email,
      passwordHash: 'rbac-test-password',
      role,
    });
  }
  const template = loadAssetTracks()[0].trackData;
  const tracks = await Track.create(Array.from({ length: 36 }, (_, index) => ({
    ...template,
    title: `RBAC Fixture ${index + 1}`,
    artist: 'RBAC Test',
    audioAssetUrl: '',
    coverImageUrl: '',
  })));
  await mongoose.disconnect();

  const port = await findAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MONGO_URI: mongoUri,
      JWT_SECRET: jwtSecret,
      NODE_ENV: 'test',
      PORT: String(port),
      CLIENT_URL: baseUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => { serverLogs = (serverLogs + chunk.toString()).slice(-8000); });
  serverProcess.stderr.on('data', (chunk) => { serverLogs = (serverLogs + chunk.toString()).slice(-8000); });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) throw new Error(`Server failed to start: ${serverLogs}`);
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error(`Server health check timed out: ${serverLogs}`);

  const tokens = {};
  for (const [key, email] of specs.map(([key, email]) => [key, email])) {
    const login = await request(baseUrl, null, 'POST', '/api/auth/login', {
      email,
      password: 'rbac-test-password',
    });
    if (login.status !== 200 || !login.data.token) throw new Error(`Login failed for ${key}.`);
    tokens[key] = login.data.token;
  }
  for (const key of ['listener', 'codj', 'host', 'admin']) {
    const profile = recordHttp(roleName(key), 'GET /api/auth/me', 200,
      await request(baseUrl, tokens[key], 'GET', '/api/auth/me'));
    if (key === 'codj' && profile.data.user.role !== 'listener') {
      throw new Error('Co-DJ must remain a global listener.');
    }
  }

  recordHttp('Listener', 'POST /api/lounges', 403,
    await request(baseUrl, tokens.listener, 'POST', '/api/lounges', { name: 'Forbidden' }));
  recordHttp('Co-DJ', 'POST /api/lounges (global role is listener)', 403,
    await request(baseUrl, tokens.codj, 'POST', '/api/lounges', { name: 'Forbidden' }));
  const created = recordHttp('Host', 'POST /api/lounges', 201,
    await request(baseUrl, tokens.host, 'POST', '/api/lounges', {
      name: 'RBAC Actual Request Test',
      seedTrackId: String(tracks[0]._id),
      soundclashEnabled: true,
    }));
  const loungeId = created.data.lounge.id;
  const adminCreated = recordHttp('Admin', 'POST /api/lounges', 201,
    await request(baseUrl, tokens.admin, 'POST', '/api/lounges', {
      name: 'RBAC Admin Lounge',
      seedTrackId: String(tracks[31]._id),
    }));
  const adminLoungeId = adminCreated.data.lounge.id;
  for (const key of ['listener', 'codj', 'host']) {
    recordHttp(roleName(key), 'POST /api/lounges/join (Admin lounge)', 200,
      await request(baseUrl, tokens[key], 'POST', '/api/lounges/join', {
        inviteCode: adminCreated.data.lounge.inviteCode,
      }));
  }
  for (const key of ['listener', 'codj']) {
    recordHttp(roleName(key), 'PUT /api/lounges/:id/moderation action=transfer', 403,
      await request(baseUrl, tokens[key], 'PUT', `/api/lounges/${adminLoungeId}/moderation`, {
        action: 'transfer',
        participantId: String(users.host._id),
      }));
  }
  recordHttp('Admin', 'PUT /api/lounges/:id/moderation action=transfer', 200,
    await request(baseUrl, tokens.admin, 'PUT', `/api/lounges/${adminLoungeId}/moderation`, {
      action: 'transfer',
      participantId: String(users.host._id),
    }));
  recordHttp('Host', 'PUT /api/lounges/:id/moderation action=transfer', 200,
    await request(baseUrl, tokens.host, 'PUT', `/api/lounges/${adminLoungeId}/moderation`, {
      action: 'transfer',
      participantId: String(users.admin._id),
    }));
  for (const key of ['listener', 'codj', 'host', 'admin']) {
    recordHttp(roleName(key), 'POST /api/lounges/join', 200,
      await request(baseUrl, tokens[key], 'POST', '/api/lounges/join', {
        inviteCode: created.data.lounge.inviteCode,
      }));
  }
  recordHttp('Host', 'PUT /api/lounges/:id/moderation action=set-co-dj', 200,
    await request(baseUrl, tokens.host, 'PUT', `/api/lounges/${loungeId}/moderation`, {
      action: 'set-co-dj',
      participantId: String(users.codj._id),
      enabled: true,
    }));
  recordHttp('Guest', 'POST /api/lounges/join', 200,
    await request(baseUrl, tokens.guest, 'POST', '/api/lounges/join', {
      inviteCode: created.data.lounge.inviteCode,
    }));

  const memberOnlyEndpoints = [
    ['GET', `/api/lounges/${loungeId}`],
    ['PUT', `/api/lounges/${loungeId}/status`, { status: 'live' }],
    ['POST', `/api/lounges/${loungeId}/leave`, {}],
    ['PUT', `/api/lounges/${loungeId}/moderation`, { action: 'lock', locked: true }],
    ['GET', `/api/queue/${loungeId}`],
    ['POST', `/api/queue/${loungeId}/add`, { trackId: String(tracks[30]._id) }],
    ['POST', `/api/queue/${loungeId}/vote`, { queueEntryId: String(tracks[30]._id) }],
    ['DELETE', `/api/queue/${loungeId}/${tracks[30]._id}`],
    ['POST', `/api/queue/${loungeId}/next`, {}],
    ['GET', `/api/soundclash/${loungeId}`],
    ['POST', `/api/soundclash/${loungeId}/submit`, { trackId: String(tracks[30]._id) }],
    ['DELETE', `/api/soundclash/${loungeId}/candidates/${tracks[30]._id}`],
    ['POST', `/api/soundclash/${loungeId}/open`, { durationSeconds: 30 }],
    ['POST', `/api/soundclash/${loungeId}/vote`, { candidateTrackId: String(tracks[30]._id) }],
    ['POST', `/api/soundclash/${loungeId}/resolve`, {}],
    ['GET', `/api/chat/${loungeId}`],
    ['POST', `/api/chat/${loungeId}`, { body: 'outsider must be denied' }],
    ['POST', `/api/chat/${loungeId}/${new mongoose.Types.ObjectId()}/reactions`, { emoji: '🔥' }],
    ['GET', `/api/aidj/${loungeId}/compatible`],
    ['POST', `/api/aidj/${loungeId}/segue`, {}],
    ['POST', `/api/aidj/${loungeId}/segue/apply`, { trackId: String(tracks[30]._id) }],
    ['POST', `/api/aidj/${loungeId}/ask`, { question: 'What track is playing?' }],
    ['GET', `/api/analytics/${loungeId}`],
  ];
  for (const [method, route, body] of memberOnlyEndpoints) {
    recordHttp('Non-member', `${method} ${route.replace(loungeId, ':loungeId')}`, 403,
      await request(baseUrl, tokens.outsider, method, route, body));
  }

  let trackIndex = 1;
  async function addTrack(key) {
    const track = tracks[trackIndex++];
    const response = recordHttp(roleName(key), 'POST /api/queue/:loungeId/add', 200,
      await request(baseUrl, tokens[key], 'POST', `/api/queue/${loungeId}/add`, {
        trackId: String(track._id),
      }));
    const entry = response.data.queue.find((item) =>
      String(item.track?._id || item.track) === String(track._id)
    ) || response.data.queue.at(-1);
    return String(entry._id);
  }

  for (const key of ['listener', 'codj', 'host', 'admin']) {
    const role = roleName(key);
    for (const [method, route, body] of [
      ['GET', '/api/lounges'],
      ['GET', '/api/lounges/my'],
      ['GET', '/api/tracks'],
      ['GET', `/api/tracks/${tracks[0]._id}`],
      ['GET', '/api/recommendations'],
      ['GET', '/api/recommendations/taste-profile'],
      ['GET', '/api/recommendations/interactions'],
      ['POST', '/api/recommendations/interaction', { trackId: String(tracks[29]._id), playedSeconds: 5 }],
      ['GET', '/api/analytics/user/dashboard'],
      ['GET', `/api/lounges/${loungeId}`],
      ['GET', `/api/queue/${loungeId}`],
      ['GET', `/api/soundclash/${loungeId}`],
      ['GET', `/api/chat/${loungeId}`],
      ['POST', `/api/chat/${loungeId}`, { body: `RBAC chat test from ${role}` }],
      ['GET', `/api/aidj/${loungeId}/compatible`],
      ['POST', `/api/aidj/${loungeId}/ask`, { question: 'What track is playing?' }],
      ['POST', `/api/aidj/tracks/${tracks[0]._id}/ask`, { question: 'What genre is this track?' }],
      ['GET', `/api/analytics/${loungeId}`],
    ]) {
      const response = await request(baseUrl, tokens[key], method, route, body);
      recordHttp(role, `${method} ${route.replace(loungeId, ':loungeId')}`, [200, 201], response);
      if (method === 'POST' && route.startsWith('/api/chat/')) {
        const messageId = response.data.message._id;
        recordHttp(role, 'POST /api/chat/:loungeId/:messageId/reactions', 200,
          await request(baseUrl, tokens[key], 'POST', `/api/chat/${loungeId}/${messageId}/reactions`, {
            emoji: '🔥',
          }));
      }
    }
  }
  const protectedTrackId = String(tracks[30]._id);
  for (const key of ['listener', 'codj', 'host']) {
    recordHttp(roleName(key), 'PUT /api/tracks/:id (not uploader/admin)', 403,
      await request(baseUrl, tokens[key], 'PUT', `/api/tracks/${protectedTrackId}`, {
        title: `Forbidden ${key} update`,
      }));
    recordHttp(roleName(key), 'DELETE /api/tracks/:id', 403,
      await request(baseUrl, tokens[key], 'DELETE', `/api/tracks/${protectedTrackId}`));
  }
  recordHttp('Admin', 'PUT /api/tracks/:id', 200,
    await request(baseUrl, tokens.admin, 'PUT', `/api/tracks/${protectedTrackId}`, {
      title: 'RBAC Admin Updated Fixture',
    }));

  for (const [key, expected] of [['listener', 403], ['codj', 403], ['host', 200], ['admin', 200]]) {
    recordHttp(roleName(key), 'PUT /api/lounges/:id/status', expected,
      await request(baseUrl, tokens[key], 'PUT', `/api/lounges/${loungeId}/status`, {
        status: 'live',
      }));
  }
  for (const key of ['listener', 'codj']) {
    recordHttp(roleName(key), 'PUT /api/lounges/:id/moderation action=mute', 403,
      await request(baseUrl, tokens[key], 'PUT', `/api/lounges/${loungeId}/moderation`, {
        action: 'mute',
        participantId: String(users.guest._id),
        muted: true,
      }));
    recordHttp(roleName(key), 'PUT /api/lounges/:id/moderation action=remove', 403,
      await request(baseUrl, tokens[key], 'PUT', `/api/lounges/${loungeId}/moderation`, {
        action: 'remove',
        participantId: String(users.guest._id),
      }));
  }
  for (const key of ['host', 'admin']) {
    recordHttp(roleName(key), 'PUT /api/lounges/:id/moderation action=mute', 200,
      await request(baseUrl, tokens[key], 'PUT', `/api/lounges/${loungeId}/moderation`, {
        action: 'mute',
        participantId: String(users.guest._id),
        muted: true,
      }));
    recordHttp(roleName(key), 'PUT /api/lounges/:id/moderation action=mute (unmute)', 200,
      await request(baseUrl, tokens[key], 'PUT', `/api/lounges/${loungeId}/moderation`, {
        action: 'mute',
        participantId: String(users.guest._id),
        muted: false,
      }));
  }
  recordHttp('Host', 'PUT /api/lounges/:id/moderation action=remove', 200,
    await request(baseUrl, tokens.host, 'PUT', `/api/lounges/${loungeId}/moderation`, {
      action: 'remove',
      participantId: String(users.guest._id),
    }));
  recordHttp('Guest (banned)', 'POST /api/lounges/join after removal', 403,
    await request(baseUrl, tokens.guest, 'POST', '/api/lounges/join', {
      inviteCode: created.data.lounge.inviteCode,
    }));

  for (const key of ['listener', 'codj', 'host', 'admin']) {
    const applyTrack = tracks[trackIndex++];
    recordHttp('Listener', 'POST /api/queue/:loungeId/add (segue candidate)', 200,
      await request(baseUrl, tokens.listener, 'POST', `/api/queue/${loungeId}/add`, {
        trackId: String(applyTrack._id),
      }));
    const expected = ['codj', 'host', 'admin'].includes(key) ? 200 : 403;
    recordHttp(roleName(key), 'POST /api/aidj/:loungeId/segue', expected,
      await request(baseUrl, tokens[key], 'POST', `/api/aidj/${loungeId}/segue`, {}));
    recordHttp(roleName(key), 'POST /api/aidj/:loungeId/segue/apply', expected,
      await request(baseUrl, tokens[key], 'POST', `/api/aidj/${loungeId}/segue/apply`, {
        trackId: String(applyTrack._id),
      }));
  }

  const voteEntries = {};
  for (const key of ['listener', 'codj', 'host', 'admin']) voteEntries[key] = await addTrack(key);
  for (const key of ['listener', 'codj', 'host', 'admin']) {
    recordHttp(roleName(key), 'POST /api/queue/:loungeId/vote', 200,
      await request(baseUrl, tokens[key], 'POST', `/api/queue/${loungeId}/vote`, {
        queueEntryId: voteEntries[key],
      }));
  }
  const hostAddedEntry = await addTrack('host');
  recordHttp('Listener', 'DELETE /api/queue/:loungeId/:queueEntryId (another user’s track)', 403,
    await request(baseUrl, tokens.listener, 'DELETE', `/api/queue/${loungeId}/${hostAddedEntry}`));
  for (const key of ['codj', 'host', 'admin']) {
    const entry = await addTrack('listener');
    recordHttp(roleName(key), 'DELETE /api/queue/:loungeId/:queueEntryId (another user’s track)', 200,
      await request(baseUrl, tokens[key], 'DELETE', `/api/queue/${loungeId}/${entry}`));
  }
  await addTrack('listener');
  recordHttp('Listener', 'POST /api/queue/:loungeId/next', 403,
    await request(baseUrl, tokens.listener, 'POST', `/api/queue/${loungeId}/next`, {}));
  for (const key of ['codj', 'host', 'admin']) {
    await addTrack('listener');
    recordHttp(roleName(key), 'POST /api/queue/:loungeId/next', 200,
      await request(baseUrl, tokens[key], 'POST', `/api/queue/${loungeId}/next`, {}));
  }

  const candidateA = tracks[trackIndex++];
  const candidateB = tracks[trackIndex++];
  for (const candidate of [tracks[32], tracks[33]]) {
    recordHttp('Admin', 'POST /api/soundclash/:loungeId/submit (Admin-hosted lounge)', 200,
      await request(baseUrl, tokens.admin, 'POST', `/api/soundclash/${adminLoungeId}/submit`, {
        trackId: String(candidate._id),
      }));
  }
  recordHttp('Admin', 'POST /api/soundclash/:loungeId/open (Admin-hosted lounge)', 200,
    await request(baseUrl, tokens.admin, 'POST', `/api/soundclash/${adminLoungeId}/open`, {
      durationSeconds: 30,
    }));
  for (const candidate of [candidateA, candidateB]) {
    recordHttp('Listener', 'POST /api/soundclash/:loungeId/submit', 200,
      await request(baseUrl, tokens.listener, 'POST', `/api/soundclash/${loungeId}/submit`, {
        trackId: String(candidate._id),
      }));
  }
  for (const [key, expected] of [['listener', 403], ['codj', 403]]) {
    recordHttp(roleName(key), 'DELETE /api/soundclash/:loungeId/candidates/:trackId', expected,
      await request(baseUrl, tokens[key], 'DELETE',
        `/api/soundclash/${loungeId}/candidates/${candidateA._id}`));
  }
  recordHttp('Host', 'DELETE /api/soundclash/:loungeId/candidates/:trackId', 200,
    await request(baseUrl, tokens.host, 'DELETE',
      `/api/soundclash/${loungeId}/candidates/${candidateA._id}`));
  recordHttp('Listener', 'POST /api/soundclash/:loungeId/submit (resubmit candidate)', 200,
    await request(baseUrl, tokens.listener, 'POST', `/api/soundclash/${loungeId}/submit`, {
      trackId: String(candidateA._id),
    }));
  recordHttp('Admin', 'DELETE /api/soundclash/:loungeId/candidates/:trackId', 200,
    await request(baseUrl, tokens.admin, 'DELETE',
      `/api/soundclash/${loungeId}/candidates/${candidateB._id}`));
  recordHttp('Listener', 'POST /api/soundclash/:loungeId/submit (resubmit candidate)', 200,
    await request(baseUrl, tokens.listener, 'POST', `/api/soundclash/${loungeId}/submit`, {
      trackId: String(candidateB._id),
    }));
  recordHttp('Listener', 'POST /api/soundclash/:loungeId/open', 403,
    await request(baseUrl, tokens.listener, 'POST', `/api/soundclash/${loungeId}/open`, { durationSeconds: 30 }));
  recordHttp('Co-DJ', 'POST /api/soundclash/:loungeId/open', 403,
    await request(baseUrl, tokens.codj, 'POST', `/api/soundclash/${loungeId}/open`, { durationSeconds: 30 }));
  recordHttp('Host', 'POST /api/soundclash/:loungeId/open', 200,
    await request(baseUrl, tokens.host, 'POST', `/api/soundclash/${loungeId}/open`, { durationSeconds: 10 }));
  recordHttp('Admin', 'POST /api/soundclash/:loungeId/open (battle already active)', 400,
    await request(baseUrl, tokens.admin, 'POST', `/api/soundclash/${loungeId}/open`, { durationSeconds: 30 }));
  for (const key of ['listener', 'codj', 'host', 'admin']) {
    recordHttp(roleName(key), 'POST /api/soundclash/:loungeId/vote', 200,
      await request(baseUrl, tokens[key], 'POST', `/api/soundclash/${loungeId}/vote`, {
        candidateTrackId: String(candidateA._id),
      }));
  }
  recordHttp('Listener', 'POST /api/soundclash/:loungeId/resolve (expired battle)', 403,
    await request(baseUrl, tokens.listener, 'POST', `/api/soundclash/${loungeId}/resolve`, {}));
  for (const key of ['codj', 'host', 'admin']) {
    if (key !== 'codj') {
      await mongoose.connect(mongoUri);
      const newCandidateA = tracks[trackIndex++];
      const newCandidateB = tracks[trackIndex++];
      await mongoose.connection.db.collection('lounges').updateOne(
        { _id: new mongoose.Types.ObjectId(loungeId) },
        {
          $set: {
            'soundclash.active': true,
            'soundclash.openedAt': new Date(Date.now() - 20_000),
            'soundclash.closesAt': new Date(Date.now() - 10_000),
            'soundclash.winnerId': null,
            'soundclash.candidates': [
              { track: newCandidateA._id, submittedBy: users.listener._id, votes: 3, voters: [users.listener._id, users.host._id, users.admin._id] },
              { track: newCandidateB._id, submittedBy: users.listener._id, votes: 1, voters: [users.codj._id] },
            ],
          },
        }
      );
      await mongoose.disconnect();
    } else {
      await mongoose.connect(mongoUri);
      await mongoose.connection.db.collection('lounges').updateOne(
        { _id: new mongoose.Types.ObjectId(loungeId) },
        { $set: { 'soundclash.closesAt': new Date(Date.now() - 10_000) } }
      );
      await mongoose.disconnect();
    }
    const resolveResponse = recordHttp(roleName(key),
      'POST /api/soundclash/:loungeId/resolve (expired battle)', 200,
      await request(baseUrl, tokens[key], 'POST', `/api/soundclash/${loungeId}/resolve`, {}));
    if (!resolveResponse.data.winner) throw new Error(`${roleName(key)} received 200 without a resolved winner.`);
  }

  for (const [key, expected] of [['listener', 403], ['codj', 403], ['host', 200], ['admin', 200]]) {
    const response = recordHttp(roleName(key), 'PUT /api/lounges/:id/moderation action=lock', expected,
      await request(baseUrl, tokens[key], 'PUT', `/api/lounges/${loungeId}/moderation`, {
        action: 'lock',
        locked: true,
      }));
    if (response.status === 200) {
      await request(baseUrl, tokens[key], 'PUT', `/api/lounges/${loungeId}/moderation`, {
        action: 'lock',
        locked: false,
      });
    }
  }

  for (const key of ['listener', 'codj', 'host']) {
    recordHttp(roleName(key), 'POST /api/tracks (track upload/moderation)', 403,
      await request(baseUrl, tokens[key], 'POST', '/api/tracks', new FormData()));
  }
  const form = new FormData();
  form.append('trackData', JSON.stringify({
    title: 'RBAC Admin Upload',
    artist: 'RBAC Test',
    durationSeconds: 16,
    acoustic: { bpm: 100, camelotKey: '8A', energy: 0.6, valence: 0.55 },
    timeline: [],
  }));
  form.append('audio', new Blob([fs.readFileSync(loadAssetTracks()[0].audioSourcePath)], {
    type: 'audio/wav',
  }), 'rbac-admin-upload.wav');
  const upload = recordHttp('Admin', 'POST /api/tracks (track upload/moderation)', 201,
    await request(baseUrl, tokens.admin, 'POST', '/api/tracks', form));
  if (upload.data.track?._id) {
    recordHttp('Admin', 'DELETE /api/tracks/:id (remove test upload)', 200,
      await request(baseUrl, tokens.admin, 'DELETE', `/api/tracks/${upload.data.track._id}`));
  }

  for (const [key, expected] of [['listener', 200], ['codj', 200], ['host', 400], ['admin', 200]]) {
    recordHttp(roleName(key), 'POST /api/lounges/:id/leave', expected,
      await request(baseUrl, tokens[key], 'POST', `/api/lounges/${loungeId}/leave`, {}));
  }
  for (const key of ['listener', 'codj', 'host', 'admin']) {
    recordHttp(roleName(key), 'POST /api/lounges/join (rejoin for socket tests)', 200,
      await request(baseUrl, tokens[key], 'POST', '/api/lounges/join', {
        inviteCode: created.data.lounge.inviteCode,
      }));
  }
  recordHttp('Host', 'PUT /api/lounges/:id/moderation action=set-co-dj (restore test role)', 200,
    await request(baseUrl, tokens.host, 'PUT', `/api/lounges/${loungeId}/moderation`, {
      action: 'set-co-dj',
      participantId: String(users.codj._id),
      enabled: true,
    }));

  for (const key of ['listener', 'codj', 'host', 'admin']) {
    const socket = ioClient(baseUrl, {
      auth: { token: tokens[key] },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Socket connection timeout for ${key}`)), 6000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
    });
    const join = await socketRequest(socket, 'lounge:sync', 'lounge:join', { loungeId });
    record(roleName(key), 'Socket lounge:join + lounge:sync', 'lounge:sync', join.kind, 'Authenticated live socket.');
    const expected = ['host', 'admin'].includes(key) ? 'lounge:playback:update' : 'error';
    const playback = await socketRequest(socket, expected, 'lounge:playback:control', {
      loungeId,
      action: 'position',
      positionSeconds: 1,
    });
    record(roleName(key), 'Socket lounge:playback:control', expected, playback.kind,
      playback.value?.message || 'Playback update broadcast received.');
  }
  const socketsByRole = Object.fromEntries(
    ['listener', 'codj', 'host', 'admin'].map((key, index) => [key, sockets[index]])
  );
  const socketJoined = {
    listener: true,
    codj: true,
    host: true,
    admin: true,
  };
  for (const key of ['listener', 'codj', 'host', 'admin']) {
    const pong = await socketRequest(socketsByRole[key], 'lounge:pong', 'lounge:ping', {
      loungeId,
      clientSentAt: Date.now(),
    });
    record(roleName(key), 'Socket lounge:ping', 'lounge:pong', pong.kind);

    const observerKey = key === 'listener' ? 'host' : 'listener';
    const typing = await socketRequestThrough(
      socketsByRole[observerKey],
      socketsByRole[key],
      'lounge:typing:update',
      'lounge:typing',
      { loungeId, isTyping: true },
      (message) => message.event === 'lounge.typing.update'
        && message.payload?.typingUsers?.includes(`${key} RBAC`)
    );
    const typingBroadcasted = typing.event === 'lounge.typing.update'
      && Array.isArray(typing.payload?.typingUsers);
    record(roleName(key), 'Socket lounge:typing', true, typingBroadcasted,
      'Typing update observed by another member.');
    await socketRequestThrough(
      socketsByRole[observerKey],
      socketsByRole[key],
      'lounge:typing:update',
      'lounge:typing',
      { loungeId, isTyping: false }
    );
  }
  for (const key of ['listener', 'codj', 'admin', 'host']) {
    const observerKey = key === 'host' ? 'listener' : 'host';
    if (!socketJoined[observerKey]) {
      const rejoined = await socketRequest(
        socketsByRole[observerKey],
        'lounge:sync',
        'lounge:join',
        { loungeId }
      );
      record(roleName(observerKey), 'Socket lounge:join (rejoin for presence assertion)',
        'lounge:sync', rejoined.kind);
      socketJoined[observerKey] = rejoined.kind === 'lounge:sync';
    }
    const departure = await socketRequestThrough(
      socketsByRole[observerKey],
      socketsByRole[key],
      'lounge:presence:update',
      'lounge:leave',
      { loungeId },
      (message) => message.payload?.action === 'left'
        && String(message.payload?.userId) === String(users[key]._id)
    );
    const departureBroadcasted = departure.payload?.action === 'left';
    record(roleName(key), 'Socket lounge:leave', true, departureBroadcasted,
      'Departure broadcast to remaining members.');
    socketJoined[key] = false;
  }
  const outsiderSocket = ioClient(baseUrl, {
    auth: { token: tokens.outsider },
    transports: ['websocket'],
    reconnection: false,
  });
  sockets.push(outsiderSocket);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Outsider socket connection timeout')), 6000);
    outsiderSocket.once('connect', () => { clearTimeout(timer); resolve(); });
    outsiderSocket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
  const deniedJoin = await socketRequest(outsiderSocket, 'error', 'lounge:join', { loungeId });
  const memberCheckRejected = deniedJoin.value?.message
    === 'Join this lounge before connecting to its live channel.';
  record('Non-member', 'Socket lounge:join', true, memberCheckRejected,
    deniedJoin.value?.message || '');

  console.log(JSON.stringify({
    database: 'spotify_rbac_test (temporary local DB; dropped after run)',
    recordedAt: new Date().toISOString(),
    cases: results.length,
    passed: results.filter((result) => result.result === 'PASS').length,
    failed: results.filter((result) => result.result === 'FAIL').length,
    results,
  }, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({ error: error.message, cases: results.length, results, serverLogs }, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  for (const socket of sockets) socket.disconnect();
  if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    serverProcess.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => serverProcess.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (serverProcess.exitCode === null && serverProcess.signalCode === null) serverProcess.kill('SIGKILL');
  }
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    }
    if (ownsTestDatabase && mongoose.connection.readyState === 1) {
      await mongoose.connection.db.dropDatabase();
    }
  } catch (error) {
    console.error(`Temporary RBAC database cleanup failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
});
