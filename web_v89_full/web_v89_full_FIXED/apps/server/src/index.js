import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { privacyResponseGuard } from './middleware/privacy.js';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import passwordSecurityRoutes from './routes/passwordSecurity.js';
import userRoutes from './routes/users.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import uploadRoutes from './routes/uploads.js';
import { uploadRoot } from './services/uploads.js';
import postRoutes from './routes/posts.js';
import notificationRoutes from './routes/notifications.js';
import webPushRoutes from './routes/webPush.js';
import integrationRoutes from './routes/integrations.js';
import callRoutes from './routes/calls.js';
import groupRoutes from './routes/groups.js';
import liveRoutes from './routes/live.js';
import meetingRoutes from './routes/meetings.js';
import storyRoutes from './routes/stories.js';
import { configureSockets } from './sockets/index.js';
import { notFound, errorHandler } from './middleware/errors.js';

import jitsiRoutes from './routes/jitsi.js';
await connectDatabase();

const app = express();
const server = http.createServer(app);
const isAllowedOrigin = (origin, callback) => {
  if (!origin || env.clientUrls.includes(origin)) return callback(null, true);
  if (env.nodeEnv !== 'production' && /^http:\/\/(?:localhost|127\.0\.0\.1|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/.test(origin)) return callback(null, true);
  return callback(new Error(`CORS blocked origin: ${origin}`));
};

const io = new Server(server, {
  cors: { origin: isAllowedOrigin, credentials: true },
  maxHttpBufferSize: 10e6,
  pingTimeout: 30_000
});
app.set('io', io);

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: isAllowedOrigin, credentials: true }));
app.use(privacyResponseGuard);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(uploadRoot, { maxAge: '7d', immutable: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'nexora-connect', time: new Date().toISOString() }));
app.use('/api/auth', passwordSecurityRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/web-push', webPushRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/jitsi', jitsiRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/stories', storyRoutes);

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(currentDirectory, '../../web/dist');
if (env.nodeEnv === 'production' && fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*splat', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
  app.use(notFound);
}
app.use(errorHandler);

configureSockets(io);
server.listen(env.port, () => console.log(`Nexora Connect API running at http://localhost:${env.port}`));

