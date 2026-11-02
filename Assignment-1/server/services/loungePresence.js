function connectedParticipants(sockets) {
  const participants = new Map();
  for (const socket of sockets) {
    const userId = String(socket.data?.userId || '');
    if (!userId) continue;
    participants.set(userId, {
      _id: userId,
      displayName: socket.data?.displayName || '',
      role: socket.data?.role || 'listener',
    });
  }
  return [...participants.values()];
}

function isUnexpectedDisconnect(reason) {
  return ['ping timeout', 'transport close', 'transport error'].includes(reason);
}

module.exports = { connectedParticipants, isUnexpectedDisconnect };
