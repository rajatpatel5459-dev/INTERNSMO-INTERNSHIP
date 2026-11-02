const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Lounge = require('../models/Lounge');
const { moderateLounge } = require('../controllers/loungeController');

test('host can assign and revoke a lounge-scoped Co-DJ role', async () => {
  const hostId = new mongoose.Types.ObjectId();
  const participantId = new mongoose.Types.ObjectId();
  const lounge = new Lounge({
    name: 'RBAC moderation test',
    host: hostId,
    participants: [hostId, participantId],
    coDjs: [],
  });
  const originalFindById = Lounge.findById;
  const emittedEvents = [];
  Lounge.findById = async () => lounge;
  lounge.save = async () => lounge;

  const req = {
    params: { id: String(lounge._id) },
    body: { action: 'set-co-dj', participantId: String(participantId), enabled: true },
    user: { id: String(hostId), _id: hostId, role: 'host' },
    app: {
      get: () => ({
        in: () => ({ fetchSockets: async () => [] }),
        to: () => ({ emit: (event, payload) => emittedEvents.push({ event, payload }) }),
      }),
    },
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  try {
    await moderateLounge(req, res, (error) => { throw error; });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(lounge.coDjs.map(String), [String(participantId)]);
    assert.deepEqual(res.body.moderation.coDjIds, [String(participantId)]);
    assert.equal(emittedEvents[0].event, 'lounge:moderation:update');

    req.body.enabled = false;
    await moderateLounge(req, res, (error) => { throw error; });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(lounge.coDjs.map(String), []);
    assert.deepEqual(res.body.moderation.coDjIds, []);
  } finally {
    Lounge.findById = originalFindById;
  }
});
