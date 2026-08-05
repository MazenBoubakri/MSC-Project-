import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = process.env.PORT ?? 5000;
export const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/mazentalk';

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  console.warn('[env] JWT_SECRET not set, using random per-boot secret');
}
export const JWT_SECRET = process.env.JWT_SECRET ?? randomBytes(32).toString('hex');

// Absolute path so multer (cwd-relative) and express.static agree.
export const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');

// Optional UploadThing integration (uploadthing.com). When set, uploaded files
// are proxied to UploadThing and stored off-instance so they survive redeploys
// on ephemeral platforms (Render free, Fly, etc.). Falls back to local disk.
export const UPLOADTHING_TOKEN = process.env.UPLOADTHING_TOKEN ?? '';
