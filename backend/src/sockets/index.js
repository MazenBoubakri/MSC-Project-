import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { JWT_SECRET } from '../config/env.js';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Room } from '../models/Room.js';
import { FriendRequest } from '../models/FriendRequest.js';
import { setIo, userRoom, convoRoom, roomRoom } from '../lib/io.js';
import { markOnline, markOffline } from '../lib/presence.js';
import { createMessage } from '../lib/messages.js';
import { toMessageDTO } from '../lib/dto.js';
import { broadcastNewMessage, broadcastRead } from '../lib/broadcast.js';
import { blockDirection, userBlocks } from '../lib/blocks.js';

function authMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Missing token'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
}

// Resolve a message target (direct conversation or chat room) and authorize
// the caller against it. Returns null when the target is missing or the user
// is not allowed in.
async function resolveTarget({ conversationId, roomId, userId }) {
  if (conversationId) {
    const convo = await Conversation.findOne({ _id: conversationId, participants: userId });
    return convo ? { kind: 'convo', convo } : null;
  }
  if (roomId) {
    const room = await Room.findOne({ _id: roomId, members: userId });
    return room ? { kind: 'room', room } : null;
  }
  return null;
}

async function getFriendIds(userId) {
  const accepted = await FriendRequest.find({ status: 'accepted' }).or([{ from: userId }, { to: userId }]);
  return accepted.map((f) => String(f.from === userId ? f.to : f.from));
}

export function registerSockets(io) {
  setIo(io);
  io.use(authMiddleware);

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    // Populated by the async setup below; handlers registered synchronously
    // so events arriving right after connect are never dropped.
    let myRooms = [];
    let visibleFriends = [];

    socket.on('conversation:join', async ({ conversationId } = {}) => {
      try {
        const convo = await Conversation.findOne({ _id: conversationId, participants: userId });
        if (!convo) return;
        socket.join(convoRoom(conversationId));
      } catch {
        // invalid id — ignore
      }
    });

    socket.on('conversation:leave', ({ conversationId }) => {
      socket.leave(convoRoom(conversationId));
    });

    // Join/leave the live socket room for a chat room (membership itself is
    // managed via REST POST /rooms/:id/join|leave).
    socket.on('room:join', async ({ roomId } = {}) => {
      try {
        const room = await Room.findOne({ _id: roomId, members: userId });
        if (!room) return;
        socket.join(roomRoom(roomId));
      } catch {
        // invalid id — ignore
      }
    });

    socket.on('room:leave', ({ roomId }) => {
      socket.leave(roomRoom(roomId));
    });

    socket.on('message:send', async (payload, ack) => {
      const { conversationId, roomId } = payload ?? {};
      try {
        if (!socket.data.user) return ack?.({ ok: false, error: 'Not authenticated' });
        const target = await resolveTarget({ conversationId, roomId, userId });
        if (!target) return ack?.({ ok: false, error: 'Conversation not found' });

        const base = {
          senderId: userId,
          type: payload.type ?? 'text',
          body: payload.body ?? '',
          mediaUrl: payload.mediaUrl ?? null,
          duration: payload.duration ?? null,
          replyToId: payload.replyToId ?? null,
        };

        if (target.kind === 'room') {
          const { message, target: room } = await createMessage({ roomId: target.room._id, ...base });
          broadcastNewMessage({ room, message, sender: socket.data.user, peerId: null, tempId: payload?.tempId ?? null });
          return ack?.({ ok: true, message });
        }

        const convo = target.convo;
        const peerId = convo.participants.find((id) => String(id) !== userId);
        const blocked = await blockDirection(userId, peerId);
        if (blocked) return ack?.({ ok: false, error: 'Message blocked' });

        const { message, target: conversation } = await createMessage({ conversationId: convo._id, ...base });

        broadcastNewMessage({
          conversation,
          message,
          sender: socket.data.user,
          peerId,
          tempId: payload?.tempId ?? null,
        });

        ack?.({ ok: true, message });
      } catch (err) {
        ack?.({ ok: false, error: err?.message ?? 'Failed to send' });
      }
    });

    socket.on('message:read', async ({ conversationId, roomId, upToMessageId } = {}) => {
      try {
        const target = await resolveTarget({ conversationId, roomId, userId });
        if (!target) return;

        const scope = target.kind === 'room' ? { roomId: target.room._id } : { conversationId: target.convo._id };
        const upTo = upToMessageId ? await Message.findOne({ _id: upToMessageId, ...scope }) : null;
        const before = upTo?.createdAt ?? new Date();

        const result = await Message.updateMany(
          { ...scope, senderId: { $ne: userId }, createdAt: { $lte: before }, readBy: { $ne: userId } },
          { $addToSet: { readBy: userId } }
        );

        if (target.kind === 'convo') {
          target.convo.lastReadAt.set(String(userId), before);
          await target.convo.save();
        }

        if (result.modifiedCount > 0) {
          broadcastRead({
            conversationId: target.kind === 'convo' ? String(target.convo._id) : undefined,
            roomId: target.kind === 'room' ? String(target.room._id) : undefined,
            readerId: userId,
            upTo: before,
          });
        }
      } catch {
        // read receipts are best-effort
      }
    });

    socket.on('message:react', async ({ conversationId, roomId, messageId, emoji } = {}, ack) => {
      try {
        const target = await resolveTarget({ conversationId, roomId, userId });
        if (!target || typeof emoji !== 'string' || !emoji.trim() || emoji.length > 8) return ack?.({ ok: false });

        const scope = target.kind === 'room' ? { roomId: target.room._id } : { conversationId: target.convo._id };
        const msg = await Message.findOne({ _id: messageId, ...scope });
        if (!msg) return ack?.({ ok: false });

        const existing = msg.reactions.find((r) => String(r.user) === userId && r.emoji === emoji);
        let added;
        if (existing) {
          msg.reactions = msg.reactions.filter((r) => r !== existing);
          added = false;
        } else {
          msg.reactions = msg.reactions.filter((r) => String(r.user) !== userId || r.emoji !== emoji);
          msg.reactions.push({ emoji, user: userId });
          added = true;
        }
        await msg.save();

        const targetRoom =
          target.kind === 'room' ? roomRoom(target.room._id) : convoRoom(target.convo._id);
        io.to(targetRoom).emit('message:reaction', {
          messageId: String(msg._id),
          conversationId: target.kind === 'convo' ? String(target.convo._id) : undefined,
          roomId: target.kind === 'room' ? String(target.room._id) : undefined,
          userId,
          emoji,
          added,
          reactions: msg.reactions.map((r) => ({
            emoji: r.emoji,
            user: String(r.user),
            createdAt: r.createdAt,
          })),
        });
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    const typingTimers = new Map();
    const emitTyping = async ({ conversationId, roomId }, isTyping) => {
      try {
        if (!socket.data.user) return;
        const target = await resolveTarget({ conversationId, roomId, userId });
        if (!target) return;
        if (target.kind === 'convo') {
          const peerId = target.convo.participants.find((id) => String(id) !== userId);
          if (peerId) {
            const blocker = await User.findById(peerId).select('blockedIds');
            if (userBlocks(socket.data.user, peerId) || userBlocks(blocker, userId)) return;
          }
        }
        const key = target.kind === 'room' ? String(target.room._id) : String(target.convo._id);
        const targetRoom = target.kind === 'room' ? roomRoom(target.room._id) : convoRoom(target.convo._id);
        socket.to(targetRoom).emit('typing', {
          conversationId: target.kind === 'convo' ? key : undefined,
          roomId: target.kind === 'room' ? key : undefined,
          userId,
          isTyping,
        });
        if (isTyping) {
          clearTimeout(typingTimers.get(`${userId}:${key}`));
          typingTimers.set(
            `${userId}:${key}`,
            setTimeout(() => {
              socket.to(targetRoom).emit('typing', {
                conversationId: target.kind === 'convo' ? key : undefined,
                roomId: target.kind === 'room' ? key : undefined,
                userId,
                isTyping: false,
              });
              typingTimers.delete(`${userId}:${key}`);
            }, 3000)
          );
        } else {
          clearTimeout(typingTimers.get(`${userId}:${key}`));
        }
      } catch {
        return;
      }
    };

    socket.on('typing:start', (payload) => emitTyping(payload, true));
    socket.on('typing:stop', (payload) => emitTyping(payload, false));

    // Edit own text message. Sender only, text only, live for both sides.
    socket.on('message:edit', async ({ conversationId, roomId, messageId, body } = {}, ack) => {
      try {
        const target = await resolveTarget({ conversationId, roomId, userId });
        if (!target) return ack?.({ ok: false, error: 'Conversation not found' });
        const scope = target.kind === 'room' ? { roomId: target.room._id } : { conversationId: target.convo._id };
        const msg = await Message.findOne({ _id: messageId, ...scope, senderId: userId });
        if (!msg) return ack?.({ ok: false, error: 'Message not found' });
        if (msg.deleted) return ack?.({ ok: false, error: 'Message deleted' });
        if (msg.type !== 'text') return ack?.({ ok: false, error: 'Only text messages can be edited' });
        const text = typeof body === 'string' ? body.trim() : '';
        if (!text) return ack?.({ ok: false, error: 'Message body is empty' });
        if (text.length > 160) return ack?.({ ok: false, error: 'Message too long (max 160)' });

        msg.body = text;
        msg.editedAt = new Date();
        await msg.save();

        io.to(target.kind === 'room' ? roomRoom(target.room._id) : convoRoom(target.convo._id)).emit('message:edited', {
          conversationId: target.kind === 'convo' ? String(target.convo._id) : undefined,
          roomId: target.kind === 'room' ? String(target.room._id) : undefined,
          messageId: String(msg._id),
          body: text,
          editedAt: msg.editedAt,
        });
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    // Delete own message for everyone (tombstone stays for receipts).
    socket.on('message:delete', async ({ conversationId, roomId, messageId } = {}, ack) => {
      try {
        const target = await resolveTarget({ conversationId, roomId, userId });
        if (!target) return ack?.({ ok: false, error: 'Conversation not found' });
        const scope = target.kind === 'room' ? { roomId: target.room._id } : { conversationId: target.convo._id };
        const msg = await Message.findOneAndUpdate(
          { _id: messageId, ...scope, senderId: userId },
          { deleted: true },
          { returnDocument: 'after' }
        );
        if (!msg) return ack?.({ ok: false, error: 'Message not found' });

        io.to(target.kind === 'room' ? roomRoom(target.room._id) : convoRoom(target.convo._id)).emit('message:deleted', {
          conversationId: target.kind === 'convo' ? String(target.convo._id) : undefined,
          roomId: target.kind === 'room' ? String(target.room._id) : undefined,
          messageId: String(msg._id),
        });
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on('disconnect', async () => {
      for (const t of typingTimers.values()) clearTimeout(t);
      typingTimers.clear();
      const fullyOffline = markOffline(userId, socket.id);
      let lastSeen = null;
      if (fullyOffline) {
        lastSeen = new Date();
        await User.findByIdAndUpdate(userId, { lastSeen }).catch(() => {});
      }
      const status = socket.data.user?.status ?? 'available';
      for (const fid of visibleFriends) {
        io.to(userRoom(fid)).emit('presence:update', { userId, online: !fullyOffline, lastSeen, status });
      }
      for (const r of myRooms) {
        io.to(roomRoom(r._id)).emit('presence:update', { userId, online: !fullyOffline, lastSeen, status });
      }
    });

    // ---- async setup: load the user, announce presence, join member rooms.
    // Handlers above are already registered, so nothing the client sends is
    // ever dropped while these queries run.
    void (async () => {
      try {
        const user = await User.findById(userId);
        if (!user) return socket.disconnect(true);
        socket.data.user = user;
      } catch {
        return socket.disconnect(true);
      }

      // Presence: join personal room, mark online, notify friends.
      socket.join(userRoom(userId));
      markOnline(userId, socket.id);
      const friends = await getFriendIds(userId).catch(() => []);
      // Skip friends I blocked or who blocked me: they see no presence.
      const blockers = await User.find({ _id: { $in: friends }, blockedIds: userId })
        .select('_id')
        .then((docs) => new Set(docs.map((d) => String(d._id))));
      visibleFriends = friends.filter(
        (fid) => !blockers.has(fid) && !userBlocks(socket.data.user, fid)
      );
      for (const fid of visibleFriends) {
        io.to(userRoom(fid)).emit('presence:update', { userId, online: true, lastSeen: null, status: socket.data.user.status ?? 'available' });
      }

      // Rooms: join every room I'm a member of so messages and presence flow;
      // broadcast my presence to each room.
      myRooms = await Room.find({ members: userId }).select('_id').catch(() => []);
      for (const r of myRooms) {
        socket.join(roomRoom(r._id));
        io.to(roomRoom(r._id)).emit('presence:update', { userId, online: true, lastSeen: null, status: socket.data.user.status ?? 'available' });
      }
    })();
  });

  console.log('[socket] registered');
}
