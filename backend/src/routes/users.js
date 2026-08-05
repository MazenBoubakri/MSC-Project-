import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { FriendRequest } from '../models/FriendRequest.js';
import { ApiError } from '../lib/errors.js';
import { toPublicUserDTO } from '../lib/user-dto.js';

const router = Router();
router.use(requireAuth);

router.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json({ users: [] });

  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const users = await User.find({
    _id: { $ne: req.userId },
    // users who blocked the searcher are invisible in search
    blockedIds: { $ne: req.userId },
    $or: [{ username: regex }, { fullName: regex }],
  })
    .limit(8)
    .select('username fullName avatarUrl avatarColor lastSeen bio status');

  res.json({ users: users.map(toPublicUserDTO) });
});

router.get('/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const dto = toPublicUserDTO(user);

  const relationship = await FriendRequest.findOne({
    $or: [
      { from: req.userId, to: user._id },
      { from: user._id, to: req.userId },
    ],
  });

  let friendStatus = 'none';
  if (relationship) {
    if (relationship.status === 'accepted') friendStatus = 'friends';
    else if (relationship.status === 'declined') friendStatus = 'none';
    else if (String(relationship.from) === req.userId) friendStatus = 'sent';
    else friendStatus = 'incoming';
  }

  const blocked = (req.user.blockedIds ?? []).some((id) => String(id) === String(user._id));
  res.json({ user: { ...dto, friendStatus, blocked } });
});

// Block / unblock a user. Blocks are one-way: they stop messages, presence
// and typing; friendships and history are kept.
router.post('/:id/block', async (req, res) => {
  if (String(req.params.id) === req.userId) throw ApiError.badRequest('Cannot block yourself');
  const user = await User.findByIdAndUpdate(
    req.userId,
    { $addToSet: { blockedIds: req.params.id } },
    { returnDocument: 'after' }
  );
  if (!user) throw ApiError.notFound('User not found');
  res.json({ ok: true });
});

router.delete('/:id/block', async (req, res) => {
  await User.findByIdAndUpdate(req.userId, { $pull: { blockedIds: req.params.id } });
  res.json({ ok: true });
});

export default router;
