import { Router } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { ApiError } from '../lib/errors.js';
import { isOnline } from '../lib/presence.js';
import { toConversationListItem } from '../lib/dto.js';

const router = Router();
router.use(requireAuth);

// Create or fetch a direct conversation with another user.
router.post('/', async (req, res) => {
  const { userId } = req.body ?? {};
  if (!userId || typeof userId !== 'string') throw ApiError.badRequest('userId is required');

  const peer = await User.findById(userId);
  if (!peer) throw ApiError.notFound('User not found');
  if (String(peer._id) === req.userId) throw ApiError.badRequest('Cannot chat with yourself');

  const participantIds = [req.userId, String(peer._id)].sort();
  const existing = await Conversation.findOne({ participants: { $all: participantIds, $size: 2 } });
  const convo = existing ?? (await Conversation.create({ participants: participantIds }));

  const unread = await Message.countDocuments({
    conversationId: convo._id,
    senderId: { $ne: req.userId },
    readBy: { $ne: req.userId },
  });

  const item = toConversationListItem(convo, req.userId, peer, unread);
  res.status(existing ? 200 : 201).json({ conversation: item });
});

// List conversations, newest activity first, with unread counts and peer info.
router.get('/', async (req, res) => {
  const convos = await Conversation.find({ participants: req.userId })
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .limit(50);

  const peerIds = [...new Set(convos.map((c) => c.participants.find((id) => String(id) !== req.userId)))];
  const peers = await User.find({ _id: { $in: peerIds } }).select(
    'username fullName avatarUrl avatarColor lastSeen bio status'
  );
  const peerMap = new Map(peers.map((u) => [String(u._id), u]));

  const convoIds = convos.map((c) => String(c._id));
  const myId = new Types.ObjectId(req.userId);
  const unreadCounts = await Message.aggregate([
    {
      $match: {
        conversationId: { $in: convoIds.map((id) => new Types.ObjectId(id)) },
        senderId: { $ne: myId },
        readBy: { $ne: myId },
      },
    },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } },
  ]);
  const unreadMap = new Map(unreadCounts.map((u) => [String(u._id), u.count]));

  const results = convos.map((c) => {
    const peerId = String(c.participants.find((id) => String(id) !== req.userId));
    const peer = peerMap.get(peerId);
    return toConversationListItem(c, req.userId, peer, unreadMap.get(String(c._id)) ?? 0);
  });

  res.json({ conversations: results });
});

export default router;
