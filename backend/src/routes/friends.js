import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { FriendRequest } from '../models/FriendRequest.js';
import { User } from '../models/User.js';
import { ApiError } from '../lib/errors.js';
import { isOnline } from '../lib/presence.js';
import { toPublicUserDTO } from '../lib/user-dto.js';
import { getIo, userRoom } from '../lib/io.js';

const router = Router();
router.use(requireAuth);

function toRequestDTO(reqDoc, requester, addressee) {
  return {
    id: String(reqDoc._id),
    from: requester ? { ...toPublicUserDTO(requester) } : null,
    to: addressee ? { ...toPublicUserDTO(addressee) } : null,
    status: reqDoc.status,
    createdAt: reqDoc.createdAt,
  };
}

// Send a friend request. A reverse pending request from the same user is auto-accepted.
router.post('/requests', async (req, res) => {
  const { userId } = req.body ?? {};
  if (!userId || typeof userId !== 'string') throw ApiError.badRequest('userId is required');
  if (userId === req.userId) throw ApiError.badRequest('Cannot befriend yourself');

  const target = await User.findById(userId);
  if (!target) throw ApiError.notFound('User not found');

  const reverse = await FriendRequest.findOne({ from: userId, to: req.userId, status: 'pending' });
  if (reverse) {
    reverse.status = 'accepted';
    await reverse.save();
    getIo()?.to(userRoom(userId)).emit('friend:request:accepted', { user: toPublicUserDTO(req.user) });
    return res.status(201).json({
      request: toRequestDTO(reverse, target, req.user),
      autoAccepted: true,
    });
  }

  const existing = await FriendRequest.findOne({ from: req.userId, to: userId });
  if (existing) {
    if (existing.status === 'pending') throw ApiError.conflict('Friend request already sent');
    if (existing.status === 'accepted') throw ApiError.conflict('Already friends');
    existing.status = 'pending';
    existing.createdAt = new Date();
    await existing.save();
    return res.status(201).json({ request: toRequestDTO(existing, req.user, target) });
  }

  const created = await FriendRequest.create({ from: req.userId, to: userId });
  getIo()?.to(userRoom(userId)).emit('friend:request:new', {
    request: toRequestDTO(created, req.user, target),
  });
  res.status(201).json({ request: toRequestDTO(created, req.user, target) });
});

router.post('/requests/:id/accept', async (req, res) => {
  const request = await FriendRequest.findOne({ _id: req.params.id, to: req.userId, status: 'pending' });
  if (!request) throw ApiError.notFound('No pending request found');
  request.status = 'accepted';
  await request.save();
  const [fromUser, toUser] = await Promise.all([User.findById(request.from), User.findById(request.to)]);
  getIo()?.to(userRoom(request.from)).emit('friend:request:accepted', { user: toPublicUserDTO(toUser) });
  res.json({ request: toRequestDTO(request, fromUser, toUser) });
});

router.post('/requests/:id/decline', async (req, res) => {
  const request = await FriendRequest.findOne({ _id: req.params.id, to: req.userId, status: 'pending' });
  if (!request) throw ApiError.notFound('No pending request found');
  request.status = 'declined';
  await request.save();
  res.json({ ok: true });
});

// Remove a friendship entirely (either direction).
router.post('/remove', async (req, res) => {
  const { userId } = req.body ?? {};
  if (!userId) throw ApiError.badRequest('userId is required');
  const result = await FriendRequest.deleteMany({
    $or: [
      { from: req.userId, to: userId, status: 'accepted' },
      { from: userId, to: req.userId, status: 'accepted' },
    ],
  });
  res.json({ removed: result.deletedCount });
});

// Random people to suggest: excludes me, friends, anyone I already asked
// (pending or declined), and anyone who already has a pending request to me.
router.get('/suggestions', async (req, res) => {
  const [accepted, outgoing, incomingReq] = await Promise.all([
    FriendRequest.find({ status: 'accepted' }).or([{ from: req.userId }, { to: req.userId }]),
    FriendRequest.find({ from: req.userId, status: { $in: ['pending', 'declined'] } }),
    FriendRequest.find({ to: req.userId, status: 'pending' }),
  ]);

  const exclude = new Set(
    [req.userId]
      .concat(
        accepted.map((f) => (String(f.from) === req.userId ? String(f.to) : String(f.from))),
        outgoing.map((r) => String(r.to)),
        incomingReq.map((r) => String(r.from))
      )
      .map((id) => String(id))
  );

  const docs = await User.aggregate([{ $match: { _id: { $nin: [...exclude] } } }, { $sample: { size: 5 } }]);
  const suggestions = docs.map(toPublicUserDTO);
  const pendingIds = new Set(outgoing.filter((r) => r.status === 'pending').map((r) => String(r.to)));

  res.json({
    suggestions: suggestions.map((u) => ({ ...u, requested: pendingIds.has(u.id) })),
  });
});

// Friends list with live presence + pending requests for me.
router.get('/', async (req, res) => {
  const accepted = await FriendRequest.find({ status: 'accepted' }).or([
    { from: req.userId },
    { to: req.userId },
  ]);

  const friendIds = accepted.map((f) => (String(f.from) === req.userId ? String(f.to) : String(f.from)));
  const users = await User.find({ _id: { $in: friendIds } }).select(
    'username fullName avatarUrl avatarColor lastSeen bio status'
  );
  const onlineCount = users.reduce((n, u) => n + (isOnline(u._id) ? 1 : 0), 0);

  const incoming = await FriendRequest.find({ to: req.userId, status: 'pending' })
    .sort({ createdAt: -1 })
    .limit(20);
  const requesters = await User.find({ _id: { $in: incoming.map((r) => r.from) } });
  const requesterMap = new Map(requesters.map((u) => [String(u._id), u]));

  res.json({
    friends: users.map(toPublicUserDTO),
    total: users.length,
    onlineCount,
    incoming: incoming.map((r) => toRequestDTO(r, requesterMap.get(String(r.from)), req.user)),
  });
});

export default router;
