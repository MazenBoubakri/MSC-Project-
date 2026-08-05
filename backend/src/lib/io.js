// Holds the Socket.IO server instance so REST routes can push events
// (e.g. friend request notifications) into user rooms.
let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

export function getIo() {
  return ioInstance;
}

export function userRoom(userId) {
  return `user:${String(userId)}`;
}

export function convoRoom(conversationId) {
  return `convo:${String(conversationId)}`;
}

export function roomRoom(roomId) {
  return `room:${String(roomId)}`;
}
