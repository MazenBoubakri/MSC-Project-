import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import { errorHandler, notFound } from './middleware/error.js';
import { UPLOAD_DIR } from './config/env.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import friendsRoutes from './routes/friends.js';
import conversationsRoutes from './routes/conversations.js';
import messagesRoutes from './routes/messages.js';
import roomsRoutes from './routes/rooms.js';
import storiesRoutes from './routes/stories.js';
import uploadRoutes from './routes/upload.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  // Open CORS: the frontend runs on its own origin and calls this API with
  // absolute URLs (frontend/.env VITE_API_URL). No credentials are used, so a
  // wildcard origin is safe.
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  const uploadPath = UPLOAD_DIR;
  fs.mkdirSync(uploadPath, { recursive: true });
  app.use('/uploads', express.static(uploadPath, { maxAge: '7d', immutable: true }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/friends', friendsRoutes);
  app.use('/api/conversations', conversationsRoutes);
  app.use('/api/conversations', messagesRoutes);
  app.use('/api/rooms', roomsRoutes);
  app.use('/api/stories', storiesRoutes);
  app.use('/api/upload', uploadRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
