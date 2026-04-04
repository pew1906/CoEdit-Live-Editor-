import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { connectDB } from './db/connection.js';
import { registerSocketHandlers } from './socket/handlers.js';

const PORT = process.env.PROJ_SERVER_PORT || 8001;
const FRONTEND_URL = process.env.PROJ_DEPLOYED_FRONTEND_URL || 'http://localhost:5173';
const DB_URI = process.env.PROJ_DB_CONNECTION_STRING || 'mongodb://localhost:27017/coedit-db';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'coedit-server' });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

async function start() {
  await connectDB(DB_URI);
  registerSocketHandlers(io);
  httpServer.listen(PORT, () => {
    console.log(`[CoEdit Server] Running on port ${PORT}`);
    console.log(`[CoEdit Server] Accepting connections from ${FRONTEND_URL}`);
  });
}

start().catch((err) => {
  console.error('[CoEdit Server] Fatal startup error:', err);
  process.exit(1);
});
