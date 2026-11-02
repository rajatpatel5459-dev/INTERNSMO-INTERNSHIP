function toId(value) {
  return String(value?._id || value?.id || value || '');
}

function isLoungeMember(lounge, user) {
  if (!lounge || !user) return false;
  const userId = toId(user);
  return user.role === 'admin' ||
    toId(lounge.host) === userId ||
    (lounge.participants || []).some((participant) => toId(participant) === userId) ||
    (lounge.coDjs || []).some((coDj) => toId(coDj) === userId);
}

function canControlLounge(lounge, user) {
  if (!lounge || !user) return false;
  const userId = toId(user);
  return user.role === 'admin' ||
    isLoungeHost(lounge, user) ||
    (lounge.coDjs || []).some((coDj) => toId(coDj) === userId);
}

function canRemoveQueueEntry(lounge, queueEntry, user) {
  if (!lounge || !queueEntry || !user) return false;
  return canControlLounge(lounge, user) ||
    toId(queueEntry.addedBy) === toId(user);
}

function canCreateLounge(user) {
  return Boolean(user && ['host', 'admin'].includes(user.role));
}

function isLoungeHost(lounge, user) {
  if (!lounge || !user) return false;
  return user.role === 'admin' ||
    (user.role === 'host' && toId(lounge.host) === toId(user));
}

module.exports = {
  toId,
  isLoungeMember,
  canControlLounge,
  canRemoveQueueEntry,
  canCreateLounge,
  isLoungeHost,
};
