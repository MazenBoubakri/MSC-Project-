import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';

import { UPLOAD_DIR } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const imageOk = /^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype);
  const audioOk = /^audio\/(webm|ogg|mp4|mpeg)$/.test(file.mimetype);

  if (['image', 'avatar'].includes(file.fieldname) && imageOk) return cb(null, true);
  if (file.fieldname === 'audio' && audioOk) return cb(null, true);
  if (file.fieldname === 'file' && (imageOk || audioOk)) return cb(null, true);

  cb(ApiError.badRequest('Only png, jpeg, gif, webp images or webm, ogg, mpeg audio'));
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 12 * 1024 * 1024 },
});

export function fileUrl(req, filename) {
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
}
