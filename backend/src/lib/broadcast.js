import { getIo, userRoom, convoRoom, roomRoom } from './io.js';
import { toConversationDTO, toRoomListItem } from './dto.js';

// Broadcast a newly persisted message. DMs: live message to the conversation
// room + notification to the peer's personal room. Rooms: live message to the
// room's socket room (all members) — no per-user notification, the sidebar
// room list updates from `message:new`.
export function broadcastNewMessage({ conversation, room, message, sender, peerId, tempId = null }) {
  const io = getIo();
  if (!io) return;
  const payload = {
    message: { ...message, tempId },
  };

  if (room) {
    const roomId = String(room._id);
    payload.room = toRoomListItem(room, String(sender._id));
    io.to(roomRoom(roomId)).emit('message:new', payload);
    return;
  }

  const conversationId = String(conversation._id);
  payload.conversation = toConversationDTO(conversation, String(sender._id));
  io.to(convoRoom(conversationId)).emit('message:new', payload);

  io.to(userRoom(peerId)).emit('notification:message', {
    conversationId,
    sender: { id: String(sender._id), fullName: sender.fullName, avatarUrl: sender.avatarUrl },
    type: message.type,
    body: message.body || null,
    preview: conversation.lastMessagePreview,
    at: message.createdAt,
  });
}

export function broadcastRead({ conversationId, roomId, readerId, upTo }) {
  if (roomId) {
    getIo()?.to(roomRoom(roomId)).emit('message:read', { roomId, readerId, upTo });
    return;
  }
  getIo()?.to(convoRoom(conversationId)).emit('message:read', { conversationId, readerId, upTo });
}
