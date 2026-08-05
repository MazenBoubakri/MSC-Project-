import mongoose from 'mongoose';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { Room } from '../models/Room.js';
import { User } from '../models/User.js';
import { ApiError } from './errors.js';
import { toMessageDTO } from './dto.js';

const PREVIEWS = {
  text: (body) => body.trim().slice(0, 120),
  image: () => 'Photo',
  voice: () => 'Voice message',
};

// Load the message being replied to and freeze a small snapshot of it. The
// original must live in the same conversation/room as the reply, otherwise it
// is rejected. The snapshot is never updated when the original is later edited
// or deleted (a deleted original snapshots with an empty body so the UI shows
// "Message deleted").
async function loadReplySnapshot({ replyToId, conversationId, roomId }) {
  if (!replyToId) return null;
  if (!mongoose.isValidObjectId(replyToId)) throw ApiError.badRequest('Replied message not found');
  const scope = conversationId ? { conversationId } : { roomId };
  const target = await Message.findOne({ _id: replyToId, ...scope });
  if (!target) throw ApiError.badRequest('Replied message not found');
  const sender = await User.findById(target.senderId).select('fullName');
  return {
    messageId: target._id,
    senderId: target.senderId,
    senderName: sender?.fullName || 'Unknown',
    body: target.deleted ? '' : (target.body ?? '').slice(0, 120),
    mediaType: target.type,
  };
}

// Persist a message and bump the target summary (conversation or room).
// Single source of truth used by both the REST route and the socket handler.
export async function createMessage({ conversationId = null, roomId = null, senderId, type, body = '', mediaUrl = null, duration = null, replyToId = null }) {
  if (!['text', 'image', 'voice'].includes(type)) throw ApiError.badRequest('Invalid message type');
  if (type === 'text' && !body.trim()) throw ApiError.badRequest('Message body is empty');
  if (type !== 'text' && !mediaUrl) throw ApiError.badRequest('Media message requires mediaUrl');
  if (mediaUrl && !/^(https:\/\/utfs\.io\/f\/[\w.-]+|\/uploads\/[\w.-]+)$/.test(mediaUrl)) {
    throw ApiError.badRequest('Invalid mediaUrl');
  }
  const hasConvo = !!conversationId;
  const hasRoom = !!roomId;
  if (hasConvo === hasRoom) throw ApiError.badRequest('Message needs exactly one target: conversation or room');

  const replyTo = await loadReplySnapshot({ replyToId, conversationId, roomId });

  const msg = await Message.create({
    conversationId: hasConvo ? conversationId : null,
    roomId: hasRoom ? roomId : null,
    senderId,
    type,
    body: type === 'text' ? body.trim().slice(0, 4000) : '',
    mediaUrl,
    duration: Number.isFinite(duration) && duration > 0 && duration <= 3600 ? Math.round(duration) : null,
    replyTo,
  });

  const update = {
    lastMessageAt: msg.createdAt,
    lastMessagePreview: PREVIEWS[type](body),
    lastMessageType: type,
  };
  const target = hasConvo
    ? await Conversation.findByIdAndUpdate(conversationId, update, { returnDocument: 'after' })
    : await Room.findByIdAndUpdate(
        roomId,
        { ...update, lastMessageSenderId: senderId },
        { returnDocument: 'after' }
      );

  return { message: toMessageDTO(msg), target };
}
