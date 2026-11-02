const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createStructuredRequestLogger, requestCategory } = require('../middleware/structuredRequestLogger');
const { createHealthHandlers } = require('../controllers/healthController');
const Lounge = require('../models/Lounge');
const mongoose = require('mongoose');

function mockResponse() {
  const response = new EventEmitter();
  response.headers = {};
  response.statusCode = 200;
  response.setHeader = (name, value) => {
    response.headers[name] = value;
  };
  response.finish = () => response.emit('finish');
  return response;
}

test('request logger correlates lounge actions and logs queue and AI completions without payloads', () => {
  const entries = [];
  let time = 100;
  const middleware = createStructuredRequestLogger({
    log: (entry) => entries.push(entry),
    now: () => time,
    createId: () => 'request-123',
  });
  const req = {
    method: 'POST',
    originalUrl: '/api/queue/lounge-1/vote?ignored=yes',
    headers: {},
    params: { loungeId: 'lounge-1' },
    user: { id: 'user-1' },
  };
  const res = mockResponse();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });
  req.lounge = { _id: 'lounge-1', correlationId: 'session-456' };
  time = 107;
  res.finish();

  assert.equal(nextCalled, true);
  assert.equal(res.headers['X-Request-ID'], 'request-123');
  assert.equal(res.headers['X-Correlation-ID'], 'request-123');
  assert.deepEqual(entries[0], {
    event: 'queue.mutation.completed',
    category: 'queue_mutation',
    requestId: 'request-123',
    correlationId: 'session-456',
    loungeId: 'lounge-1',
    userId: 'user-1',
    method: 'POST',
    path: '/api/queue/lounge-1/vote',
    queueMutation: true,
    statusCode: 200,
    durationMs: 7,
  });
  assert.equal(JSON.stringify(entries[0]).includes('ignored=yes'), false);

  const aiReq = { method: 'POST', originalUrl: '/api/aidj/lounge-1/ask', headers: {} };
  const aiRes = mockResponse();
  middleware(aiReq, aiRes, () => {});
  aiRes.statusCode = 400;
  aiRes.finish();
  assert.equal(entries[1].event, 'aidj.operation.completed');
  assert.equal(entries[1].statusCode, 400);
  assert.equal(entries[1].queueMutation, false);

  const applyReq = { method: 'POST', originalUrl: '/api/aidj/lounge-1/segue/apply', headers: {} };
  const applyRes = mockResponse();
  middleware(applyReq, applyRes, () => {});
  applyRes.finish();
  assert.equal(entries[2].queueMutation, true);
});

test('request logger rejects malformed caller correlation IDs and classifies Soundclash writes', () => {
  assert.equal(requestCategory('POST', '/api/soundclash/lounge-1/resolve'), 'soundclash_operation');

  const entries = [];
  const middleware = createStructuredRequestLogger({
    log: (entry) => entries.push(entry),
    createId: () => 'generated-id',
  });
  const req = {
    method: 'DELETE',
    originalUrl: '/api/queue/lounge-1/entry-1',
    headers: { 'x-correlation-id': 'bad\nvalue' },
  };
  const res = mockResponse();

  middleware(req, res, () => {});
  res.finish();
  assert.equal(res.headers['X-Correlation-ID'], 'generated-id');
  assert.equal(entries[0].correlationId, 'generated-id');

  const resolveReq = {
    method: 'POST',
    originalUrl: '/api/soundclash/lounge-1/resolve',
    headers: {},
  };
  const resolveRes = mockResponse();
  middleware(resolveReq, resolveRes, () => {});
  resolveRes.finish();
  assert.equal(entries[1].category, 'soundclash_operation');
  assert.equal(entries[1].queueMutation, true);
});

test('health handlers report API, database, and queue gateway readiness', () => {
  const mongoose = { connection: { readyState: 1 } };
  const server = { listening: true };
  const io = { engine: { clientsCount: 3 } };
  const handlers = createHealthHandlers({ mongoose, server, io });
  function invoke(handler) {
    return {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      run() { handler({}, this); return this; },
    }.run();
  }

  const apiResult = invoke(handlers.apiHealth);
  assert.equal(apiResult.statusCode, 200);
  assert.deepEqual(apiResult.body, {
    status: 'ok',
    database: 'connected',
    api: 'available',
    realtime: 'available',
  });
  assert.deepEqual(invoke(handlers.queueGatewayHealth).body, {
    status: 'ok',
    database: 'connected',
    queueGateway: 'available',
    connectedSockets: 3,
  });

  server.listening = false;
  assert.equal(invoke(handlers.queueGatewayHealth).statusCode, 503);
});

test('new lounge records receive unique persistent correlation IDs', () => {
  const first = new Lounge({ name: 'first', host: new mongoose.Types.ObjectId() });
  const second = new Lounge({ name: 'second', host: new mongoose.Types.ObjectId() });

  assert.match(first.correlationId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(first.correlationId, second.correlationId);
});
