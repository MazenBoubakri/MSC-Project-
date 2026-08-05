import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { ApiError } from '../lib/errors.js';
import { JWT_SECRET } from '../config/env.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const token = match ? match[1].trim() : null;
    if (!token) throw ApiError.unauthorized('Missing token');

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw ApiError.unauthorized('Account no longer exists');

    req.user = user;
    req.userId = String(user._id);
    next();
  } catch (err) {
    next(err);
  }
}

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: '30d' });
}
