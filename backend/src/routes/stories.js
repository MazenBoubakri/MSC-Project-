import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Story } from '../models/Story.js';
import { FriendRequest } from '../models/FriendRequest.js';
import { User } from '../models/User.js';
import { ApiError } from '../lib/errors.js';
import { getIo, userRoom } from '../lib/io.js';
import { toPublicUserDTO } from '../lib/user-dto.js';

const router = Router();
router.use(requireAuth);

const EXPIRY_MS = 24 * 60 * 60 * 1000;

async function friendIds(userId) {
  const me = String(userId);
  const accepted = await FriendRequest.find({ status: 'accepted' }).or([{ from: me }, { to: me }]);
  const ids = new Set([me]);
  for (const f of accepted) {
    const from = String(f.from);
    ids.add(from === me ? String(f.to) : from);
  }
  return [...ids];
}

function toStoryDTO(story, viewerId) {
  const seenBy = story.seenBy ?? [];
  return {
    id: String(story._id),
    ownerId: String(story.owner),
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    caption: story.caption,
    createdAt: story.createdAt,
    viewed: seenBy.some((s) => String(s.userId) === String(viewerId)),
    viewCount: seenBy.length,
  };
}

// Active stories of my friends + my own, grouped by owner (own group first).
router.get('/', async (req, res) => {
  const cutoff = new Date(Date.now() - EXPIRY_MS);
  const stories = await Story.find({ owner: { $in: await friendIds(req.userId) }, createdAt: { $gt: cutoff } }).sort(
    { createdAt: -1 }
  );

  const ownerIds = [...new Set(stories.map((s) => String(s.owner)))];
  const owners = await User.find({ _id: { $in: ownerIds } });
  const ownerMap = new Map(owners.map((u) => [String(u._id), u]));

  const groups = ownerIds.map((ownerId) => ({
    user: toPublicUserDTO(ownerMap.get(ownerId)),
    stories: stories.filter((s) => String(s.owner) === ownerId).map((s) => toStoryDTO(s, req.userId)),
  }));

  const meIdx = groups.findIndex((g) => g.user.id === String(req.userId));
  if (meIdx > 0) {
    const [mine] = groups.splice(meIdx, 1);
    groups.unshift(mine);
  }

  res.json({ groups });
});

router.post('/', async (req, res) => {
  const { mediaUrl, caption } = req.body ?? {};
  if (!mediaUrl || typeof mediaUrl !== 'string') throw ApiError.badRequest('mediaUrl is required');
  if (!/^https?:\/\/|\//.test(mediaUrl)) throw ApiError.badRequest('Invalid mediaUrl');
  if (caption !== undefined && typeof caption !== 'string') throw ApiError.badRequest('caption must be a string');

  const story = await Story.create({ owner: req.userId, mediaUrl, mediaType: 'image', caption: caption ?? '' });

  const me = await User.findById(req.userId);
  const io = getIo();
  if (io) {
    const payload = { ...toStoryDTO(story, req.userId), user: toPublicUserDTO(me) };
    for (const id of await friendIds(req.userId)) {
      if (id !== String(req.userId)) io.to(userRoom(id)).emit('story:new', payload);
    }
  }

  res.status(201).json({ story: toStoryDTO(story, req.userId) });
});

router.delete('/:id', async (req, res) => {
  const story = await Story.findOneAndDelete({ _id: req.params.id, owner: req.userId });
  if (!story) throw ApiError.notFound('Story not found');

  const io = getIo();
  if (io) {
    for (const id of await friendIds(req.userId)) {
      if (id !== String(req.userId)) {
        io.to(userRoom(id)).emit('story:deleted', { storyId: String(story._id), ownerId: String(story.owner) });
      }
    }
  }

  res.json({ ok: true });
});

router.post('/:id/seen', async (req, res) => {
  const story = await Story.findOne({ _id: req.params.id });
  if (!story) throw ApiError.notFound('Story not found');

  const me = String(req.userId);
  const alreadySeen = (story.seenBy ?? []).some((s) => String(s.userId) === me);
  if (!alreadySeen) {
    story.seenBy.push({ userId: me, seenAt: new Date() });
    await story.save();
    getIo()?.to(userRoom(String(story.owner))).emit('story:seen', {
      storyId: String(story._id),
      viewerId: me,
    });
  }

  res.json({ story: toStoryDTO(story, req.userId) });
});

// Who viewed a story — visible to the owner only.
router.get('/:id/viewers', async (req, res) => {
  const story = await Story.findOne({ _id: req.params.id, owner: req.userId });
  if (!story) throw ApiError.notFound('Story not found');

  const seenBy = story.seenBy ?? [];
  const users = await User.find({ _id: { $in: seenBy.map((s) => s.userId) } });
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const viewers = seenBy
    .map((s) => ({
      user: toPublicUserDTO(userMap.get(String(s.userId))),
      seenAt: s.seenAt,
    }))
    .sort((a, b) => new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime());

  res.json({ viewers });
});

export default router;
