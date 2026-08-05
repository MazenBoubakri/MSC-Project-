import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { ApiError } from '../lib/errors.js';
import { createMessage } from '../lib/messages.js';
import { broadcastNewMessage, broadcastRead } from '../lib/broadcast.js';
import { toMessageDTO } from '../lib/dto.js';
import { blockDirection } from '../lib/blocks.js';

const router = Router();
router.use(requireAuth);

async function getConvoOrThrow(convoId, userId) {
  const convo = await Conversation.findOne({ _id: convoId, participants: userId });
  if (!convo) throw ApiError.notFound('Conversation not found');
  return convo;
}

// In-conversation message search (text messages only, newest first).
router.get('/:conversationId/messages/search', async (req, res) => {
  const convo = await getConvoOrThrow(req.params.conversationId, req.userId);
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json({ messages: [] });

  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const messages = await Message.find({
    conversationId: convo._id,
    type: 'text',
    deleted: { $ne: true },
    body: regex,
  })
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({ messages: messages.map(toMessageDTO) });
});

// Cursor pagination: pass ?before=<messageId> for older pages.
router.get('/:conversationId/messages', async (req, res) => {
  await getConvoOrThrow(req.params.conversationId, req.userId);

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 60);
  const filter = { conversationId: req.params.conversationId };
  if (req.query.before) {
    const before = await Message.findById(req.query.before);
    if (before) filter.createdAt = { $lt: before.createdAt };
  }

  const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1);

  res.json({
    messages: messages.slice(0, limit).reverse().map(toMessageDTO),
    hasMore: messages.length > limit,
  });
});

// REST fallback for sending a message; the socket path is primary but this is
// handy for the upload-then-send flow and for testing.
router.post('/:conversationId/messages', async (req, res) => {
  const convo = await getConvoOrThrow(req.params.conversationId, req.userId);
  const peerId = convo.participants.find((id) => String(id) !== req.userId);
  const blocked = await blockDirection(req.userId, peerId);
  if (blocked) throw ApiError.forbidden('Message blocked');
  const { body = '', type = 'text', mediaUrl = null, duration = null, replyToId = null } = req.body ?? {};

  const { message, target: conversation } = await createMessage({
    conversationId: convo._id,
    senderId: req.userId,
    type,
    body,
    mediaUrl,
    duration,
    replyToId,
  });

  broadcastNewMessage({ conversation, message, sender: req.user, peerId, tempId: null });

  res.status(201).json({ message });
});

// Mark a batch of messages as read, return the count just marked.
router.post('/:conversationId/read', async (req, res) => {
  const convo = await getConvoOrThrow(req.params.conversationId, req.userId);
  const upTo = new Date();

  const result = await Message.updateMany(
    { conversationId: convo._id, senderId: { $ne: req.userId }, readBy: { $ne: req.userId }, createdAt: { $lte: upTo } },
    { $addToSet: { readBy: req.userId } }
  );

  convo.lastReadAt.set(String(req.userId), upTo);
  await convo.save();

  if (result.modifiedCount > 0) {
    broadcastRead({ conversationId: String(convo._id), readerId: req.userId, upTo });
  }

  res.json({ marked: result.modifiedCount });
});

export default router;
