// In-memory presence map. Fine for a single-instance project app (~10 users).
// userId -> Set of socket ids currently connected.
const online = new Map();

export function markOnline(userId, socketId) {
  const id = String(userId);
  if (!online.has(id)) online.set(id, new Set());
  online.get(id).add(socketId);
}

// Returns true when the user has no remaining connected sockets.
export function markOffline(userId, socketId) {
  const id = String(userId);
  const sockets = online.get(id);
  if (!sockets) return true;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    online.delete(id);
    return true;
  }
  return false;
}

export function isOnline(userId) {
  return online.has(String(userId));
}

export function onlineUsers() {
  return [...online.keys()];
}
