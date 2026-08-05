import { createServer } from 'node:http';
import { Server } from 'socket.io';

import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { PORT, MONGO_URI } from './config/env.js';
import { registerSockets } from './sockets/index.js';

async function main() {
  await connectDb(MONGO_URI);

  const app = createApp();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  registerSockets(io);

  httpServer.listen(PORT, () => {
    console.log(`[server] MazenTalk backend on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
