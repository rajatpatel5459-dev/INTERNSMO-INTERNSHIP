function createHealthHandlers({ mongoose, server, io }) {
  function apiHealth(_req, res) {
    const databaseReady = mongoose.connection.readyState === 1;
    const serverReady = server.listening;
    const ready = databaseReady && serverReady;

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'unavailable',
      database: databaseReady ? 'connected' : 'disconnected',
      api: serverReady ? 'available' : 'unavailable',
      realtime: serverReady && io.engine ? 'available' : 'unavailable',
    });
  }

  function queueGatewayHealth(_req, res) {
    const databaseReady = mongoose.connection.readyState === 1;
    const gatewayReady = server.listening && Boolean(io.engine);
    const ready = databaseReady && gatewayReady;

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'unavailable',
      database: databaseReady ? 'connected' : 'disconnected',
      queueGateway: gatewayReady ? 'available' : 'unavailable',
      connectedSockets: gatewayReady ? io.engine.clientsCount : 0,
    });
  }

  return { apiHealth, queueGatewayHealth };
}

module.exports = { createHealthHandlers };
