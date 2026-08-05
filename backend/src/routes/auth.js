import { Router } from 'express';
import fs from 'node:fs';
import { requireAuth, signToken } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { uploadToUploadThing } from '../lib/uploadthing.js';
import { User } from '../models/User.js';
import { ApiError } from '../lib/errors.js';
import { toUserDTO } from '../lib/user-dto.js';
import { hashPassword, verifyPassword, isValidPassword } from '../lib/password.js';

const router = Router();

const STATUSES = ['available', 'away', 'busy'];

function validateProfile({ username, fullName, avatarColor }) {
  const name = typeof fullName === 'string' ? fullName.trim() : '';
  const uname = typeof username === 'string' ? username.trim().toLowerCase() : '';

  if (name.length < 2 || name.length > 50) {
    throw ApiError.badRequest('Full name must be 2-50 characters');
  }
  if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
    throw ApiError.badRequest('Username must be 3-20 characters: letters, numbers, underscores');
  }
  if (avatarColor && !/^#[0-9a-fA-F]{6}$/.test(avatarColor)) {
    throw ApiError.badRequest('Invalid avatar color');
  }
  return { username: uname, fullName: name, avatarColor };
}

// Create an account with a password (scrypt-hashed).
router.post('/register', async (req, res) => {
  const { username, fullName, avatarColor, avatarUrl, password } = req.body ?? {};
  const profile = validateProfile({ username, fullName, avatarColor });
  if (!isValidPassword(password)) {
    throw ApiError.badRequest('Password must be 8-128 characters');
  }

  const { salt, hash } = hashPassword(password);
  const user = await User.create({
    ...profile,
    passwordHash: hash,
    passwordSalt: salt,
    avatarUrl:
      typeof avatarUrl === 'string' && /^(https:\/\/utfs\.io\/f\/[\w.-]+|\/uploads\/[\w.-]+)$/.test(avatarUrl)
        ? avatarUrl
        : null,
  });

  res.status(201).json({ token: signToken(user._id), user: toUserDTO(user, { online: true }) });
});

// Sign in with username + password. One generic error for every failure mode.
router.post('/login', async (req, res) => {
  const uname = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = req.body?.password;
  if (!/^[a-z0-9_]{3,20}$/.test(uname)) throw ApiError.badRequest('Invalid username');

  const user = await User.findOne({ username: uname });
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    throw ApiError.unauthorized('Invalid username or password');
  }

  res.json({ token: signToken(user._id), user: toUserDTO(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: toUserDTO(req.user) });
});

// Logout. JWTs are stateless, so the server just acknowledges; the client
// discards the token. Provided for a complete auth flow (and future
// server-side token blacklisting).
router.post('/logout', requireAuth, (req, res) => {
  res.json({ ok: true });
});

router.patch('/me', requireAuth, async (req, res) => {
  const { fullName, avatarColor, username, bio, status } = req.body ?? {};
  const updates = {};
  if (fullName !== undefined) {
    if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 50) {
      throw ApiError.badRequest('Full name must be 2-50 characters');
    }
    updates.fullName = fullName.trim();
  }
  if (avatarColor !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(avatarColor)) throw ApiError.badRequest('Invalid avatar color');
    updates.avatarColor = avatarColor;
  }
  if (username !== undefined) {
    const uname = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
      throw ApiError.badRequest('Username must be 3-20 characters: letters, numbers, underscores');
    }
    const taken = await User.findOne({ username: uname, _id: { $ne: req.userId } });
    if (taken) throw ApiError.conflict('Username is already taken');
    updates.username = uname;
  }
  if (bio !== undefined) {
    if (typeof bio !== 'string' || bio.length > 160) throw ApiError.badRequest('Bio must be 160 characters or less');
    updates.bio = bio.trim();
  }
  if (status !== undefined) {
    if (!STATUSES.includes(status)) throw ApiError.badRequest('Invalid status');
    updates.status = status;
  }
  const user = await User.findByIdAndUpdate(req.userId, updates, { returnDocument: 'after' });
  res.json({ user: toUserDTO(user) });
});

router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No avatar file provided');

  let url = `/uploads/${req.file.filename}`;
  try {
    const uploaded = await uploadToUploadThing({
      path: req.file.path,
      name: req.file.originalname,
      type: req.file.mimetype,
    });
    if (uploaded) {
      url = uploaded;
      fs.unlink(req.file.path, () => {});
    }
  } catch (err) {
    console.error('[upload] UploadThing failed, keeping local avatar:', err.message);
  }

  try {
    const user = await User.findByIdAndUpdate(req.userId, { avatarUrl: url }, { returnDocument: 'after' });
    res.json({ user: toUserDTO(user), url });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    throw err;
  }
});

export default router;
