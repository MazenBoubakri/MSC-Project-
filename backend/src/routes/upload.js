import { Router } from 'express';
import fs from 'node:fs';
import { requireAuth } from '../middleware/auth.js';
import { upload, fileUrl } from '../middleware/upload.js';
import { uploadToUploadThing } from '../lib/uploadthing.js';

const router = Router();
router.use(requireAuth);

// One upload endpoint for images and voice messages.
// Returns { url } - a utfs.io URL when UploadThing is configured, otherwise a
// local /uploads/<file> path (dev fallback).
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  let uploaded = null;
  try {
    uploaded = await uploadToUploadThing({
      path: req.file.path,
      name: req.file.originalname,
      type: req.file.mimetype,
    });
  } catch (err) {
    console.error('[upload] UploadThing failed, keeping local file:', err.message);
  }

  if (uploaded) {
    fs.unlink(req.file.path, () => {});
    return res.status(201).json({
      url: uploaded,
      absUrl: uploaded,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  }

  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    absUrl: fileUrl(req, req.file.filename),
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

export default router;
