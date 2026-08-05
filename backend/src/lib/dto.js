import { isOnline } from './presence.js';
import { toPublicUserDTO } from './user-dto.js';

export function toMessageDTO(msg) {
  return {
    id: String(msg._id),
    conversationId: msg.conversationId ? String(msg.conversationId) : null,
    roomId: msg.roomId ? String(msg.roomId) : null,
    senderId: String(msg.senderId),
    type: msg.type,
    body: msg.deleted ? null : msg.body,
    mediaUrl: msg.deleted ? null : msg.mediaUrl,
    duration: msg.duration,
    deleted: !!msg.deleted,
    editedAt: msg.editedAt ?? null,
    reactions: (msg.reactions ?? []).map((r) => ({
      emoji: r.emoji,
      user: String(r.user),
      createdAt: r.createdAt,
    })),
    readBy: (msg.readBy ?? []).map((id) => String(id)),
    replyTo: msg.replyTo
      ? {
          messageId: String(msg.replyTo.messageId),
          senderId: String(msg.replyTo.senderId),
          senderName: msg.replyTo.senderName,
          body: msg.replyTo.body,
          mediaType: msg.replyTo.mediaType,
        }
      : null,
    createdAt: msg.createdAt,
  };
}

export function toConversationDTO(convo, meId) {
  const peerId = convo.participants.find((id) => String(id) !== meId);
  return {
    id: String(convo._id),
    peerId: String(peerId),
    lastMessageAt: convo.lastMessageAt,
    lastMessagePreview: convo.lastMessagePreview,
    lastMessageType: convo.lastMessageType,
    lastReadAt: convo.lastReadAt?.get ? convo.lastReadAt.get(String(meId)) ?? null : convo.lastReadAt?.[meId] ?? null,
    createdAt: convo.createdAt,
  };
}

export function toConversationListItem(convo, meId, peer, unread = 0) {
  return {
    ...toConversationDTO(convo, meId),
      peer: peer
        ? {
            id: String(peer._id),
            username: peer.username,
            fullName: peer.fullName,
            avatarUrl: peer.avatarUrl,
            avatarColor: peer.avatarColor,
            online: isOnline(peer._id),
            lastSeen: peer.lastSeen,
            bio: peer.bio ?? '',
            status: peer.status ?? 'available',
          }
        : null,
    unread,
  };
}

export function toRoomListItem(room, meId, unread = 0) {
  return {
    id: String(room._id),
    name: room.name,
    description: room.description ?? '',
    avatarColor: room.avatarColor ?? '#2B5CFF',
    ownerId: String(room.ownerId),
    member: (room.members ?? []).some((id) => String(id) === String(meId)),
    memberCount: (room.members ?? []).length,
    lastMessageAt: room.lastMessageAt,
    lastMessagePreview: room.lastMessagePreview ?? '',
    lastMessageType: room.lastMessageType ?? 'text',
    lastMessageSenderId: room.lastMessageSenderId ? String(room.lastMessageSenderId) : null,
    createdAt: room.createdAt,
    unread,
  };
}

export function toRoomDetail(room, meId, members) {
  return {
    ...toRoomListItem(room, meId),
    memberIds: (room.members ?? []).map((id) => String(id)),
    members: members.map(toPublicUserDTO),
  };
}
