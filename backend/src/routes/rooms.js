import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Room } from '../models/Room.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { ApiError } from '../lib/errors.js';
import { createMessage } from '../lib/messages.js';
import { broadcastNewMessage } from '../lib/broadcast.js';
import { getIo, roomRoom } from '../lib/io.js';
import { toMessageDTO, toRoomDetail, toRoomListItem } from '../lib/dto.js';
import { toPublicUserDTO } from '../lib/user-dto.js';

const router = Router();
router.use(requireAuth);

// Create a chat room. The creator becomes the owner and first member.
router.post('/', async (req, res) => {
  const { name, description = '', avatarColor } = req.body ?? {};
  const roomName = typeof name === 'string' ? name.trim() : '';
  if (roomName.length < 1 || roomName.length > 50) throw ApiError.badRequest('Room name must be 1-50 characters');
  if (typeof description !== 'string' || description.length > 200) {
    throw ApiError.badRequest('Description must be 200 characters or less');
  }
  if (avatarColor !== undefined && (typeof avatarColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(avatarColor))) {
    throw ApiError.badRequest('avatarColor must be a hex color like #RRGGBB');
  }

  const room = await Room.create({
    name: roomName,
    description: description.trim(),
    ownerId: req.userId,
    members: [req.userId],
    ...(avatarColor !== undefined ? { avatarColor } : {}),
  });

  const item = toRoomListItem(room, req.userId);
  // All connected clients learn about new rooms so the "available rooms"
  // list stays live.
  getIo()?.emit('room:created', { room: item });
  res.status(201).json({ room: item });
});

// List all rooms (newest activity first) with membership + member count.
router.get('/', async (req, res) => {
  const rooms = await Room.find().sort({ lastMessageAt: -1, createdAt: -1 }).limit(50);
  const items = rooms.map((r) => toRoomListItem(r, req.userId));

  const myRoomIds = items.filter((r) => r.member).map((r) => r.id);
  const unreadMap = new Map();
  if (myRoomIds.length > 0) {
    const counts = await Message.aggregate([
      { $match: { roomId: { $in: myRoomIds }, senderId: { $ne: req.userId }, readBy: { $ne: req.userId } } },
      { $group: { _id: '$roomId', count: { $sum: 1 } } },
    ]);
    for (const c of counts) unreadMap.set(String(c._id), c.count);
  }

  res.json({ rooms: items.map((r) => ({ ...r, unread: unreadMap.get(r.id) ?? 0 })) });
});

// Room detail with the full member list ("users present in the room").
router.get('/:id', async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) throw ApiError.notFound('Room not found');
  const members = await User.find({ _id: { $in: room.members } }).select(
    'username fullName avatarUrl avatarColor lastSeen bio status'
  );
  res.json({ room: toRoomDetail(room, req.userId, members) });
});

// Join a room. Idempotent; notifies the other members.
router.post('/:id/join', async (req, res) => {
  const room = await Room.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { members: req.userId } },
    { returnDocument: 'after' }
  );
  if (!room) throw ApiError.notFound('Room not found');

  const member = await User.findById(req.userId);
  getIo()?.to(roomRoom(room._id)).emit('room:member:joined', {
    roomId: String(room._id),
    member: toPublicUserDTO(member),
    memberCount: room.members.length,
  });
  res.json({ room: toRoomListItem(room, req.userId) });
});

// Leave a room. If the owner leaves, ownership transfers to the earliest
// remaining member; when the last member leaves, the room is deleted.
router.post('/:id/leave', async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) throw ApiError.notFound('Room not found');
  if (!(room.members ?? []).some((id) => String(id) === req.userId)) {
    throw ApiError.badRequest('You are not a member of this room');
  }

  room.members = (room.members ?? []).filter((id) => String(id) !== req.userId);

  if (room.members.length === 0) {
    await Message.deleteMany({ roomId: room._id });
    await room.deleteOne();
    getIo()?.emit('room:deleted', { roomId: String(req.params.id) });
    return res.json({ ok: true, deleted: true });
  }

  if (String(room.ownerId) === req.userId) {
    room.ownerId = room.members[0];
  }
  await room.save();

  const io = getIo();
  io?.to(roomRoom(room._id)).emit('room:member:left', {
    roomId: String(room._id),
    memberId: req.userId,
    memberCount: room.members.length,
    ownerId: String(room.ownerId),
  });
  res.json({ room: toRoomListItem(room, req.userId), deleted: false });
});

// Delete a room (owner only): removes the room and its messages.
router.delete('/:id', async (req, res) => {
  const room = await Room.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!room) throw ApiError.notFound('Room not found or you are not the owner');
  await Message.deleteMany({ roomId: room._id });
  await room.deleteOne();
  getIo()?.emit('room:deleted', { roomId: String(req.params.id) });
  res.json({ ok: true });
});

// Update room details (owner only): name, description, avatarColor.
router.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  const update = {};

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 50) throw ApiError.badRequest('Room name must be 1-50 characters');
    update.name = name;
  }
  if ('description' in body) {
    if (typeof body.description !== 'string' || body.description.length > 200) {
      throw ApiError.badRequest('Description must be 200 characters or less');
    }
    update.description = body.description.trim();
  }
  if ('avatarColor' in body) {
    if (typeof body.avatarColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.avatarColor)) {
      throw ApiError.badRequest('avatarColor must be a hex color like #RRGGBB');
    }
    update.avatarColor = body.avatarColor;
  }

  if (Object.keys(update).length === 0) throw ApiError.badRequest('Nothing to update');

  const room = await Room.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.userId },
    update,
    { returnDocument: 'after' }
  );
  if (!room) throw ApiError.notFound('Room not found or you are not the owner');

  res.json({ room: toRoomListItem(room, req.userId) });
});

async function getRoomForMember(roomId, userId) {
  const room = await Room.findOne({ _id: roomId, members: userId });
  if (!room) throw ApiError.notFound('Room not found or you are not a member');
  return room;
}

// In-room message search (text only, newest first).
router.get('/:id/messages/search', async (req, res) => {
  await getRoomForMember(req.params.id, req.userId);
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json({ messages: [] });

  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const messages = await Message.find({
    roomId: req.params.id,
    type: 'text',
    deleted: { $ne: true },
    body: regex,
  })
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({ messages: messages.map(toMessageDTO) });
});

// Cursor pagination: pass ?before=<messageId> for older pages.
router.get('/:id/messages', async (req, res) => {
  await getRoomForMember(req.params.id, req.userId);

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 60);
  const filter = { roomId: req.params.id };
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

// REST fallback for sending a room message (socket path is primary).
router.post('/:id/messages', async (req, res) => {
  const room = await getRoomForMember(req.params.id, req.userId);
  const { body = '', type = 'text', mediaUrl = null, duration = null, replyToId = null } = req.body ?? {};

  const { message, target } = await createMessage({
    roomId: room._id,
    senderId: req.userId,
    type,
    body,
    mediaUrl,
    duration,
    replyToId,
  });

  broadcastNewMessage({ room: target, message, sender: req.user, peerId: null, tempId: null });
  res.status(201).json({ message });
});

export default router;
