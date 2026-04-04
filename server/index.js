import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { connectDB } from './db/connection.js';
import { registerSocketHandlers } from './socket/handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PROJ_SERVER_PORT || 8001;
const FRONTEND_URL = process.env.PROJ_DEPLOYED_FRONTEND_URL || 'http://localhost:5173';
const DB_URI = process.env.PROJ_DB_CONNECTION_STRING || 'mongodb://localhost:27017/coedit-db';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'coedit-server' });
});

// In production, serve the built React client from ../client/dist
if (IS_PRODUCTION) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: IS_PRODUCTION ? FRONTEND_URL : '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

async function start() {
  await connectDB(DB_URI);
  registerSocketHandlers(io);
  httpServer.listen(PORT, () => {
    console.log(`[CoEdit Server] Running on port ${PORT}`);
    console.log(`[CoEdit Server] Mode: ${IS_PRODUCTION ? 'production' : 'development'}`);
  });
}

start().catch((err) => {
  console.error('[CoEdit Server] Fatal startup error:', err);
  process.exit(1);
});
