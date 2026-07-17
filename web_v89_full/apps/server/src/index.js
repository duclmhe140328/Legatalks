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
function normalizeOrigin(value) {
  const raw = String(value || '').trim();

  if (!raw) return '';

  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

const allowedOrigins = new Set(
  [
    process.env.CLIENT_URL,
    process.env.PUBLIC_SERVER_URL,
    process.env.RENDER_EXTERNAL_URL,
    ...String(process.env.CLIENT_URLS || '').split(','),
  ]
    .map(normalizeOrigin)
    .filter(Boolean),
);

function isAllowedOrigin(origin, callback) {
  /*
   * Một số request nội bộ, mobile app hoặc server-to-server
   * không gửi Origin.
   */
  if (!origin) {
    return callback(null, true);
  }

  const normalizedOrigin = normalizeOrigin(origin);

  if (allowedOrigins.has(normalizedOrigin)) {
    return callback(null, true);
  }

  /*
   * Cho phép localhost và IP LAN khi phát triển local.
   */
  if (
    process.env.NODE_ENV !== 'production' &&
    /^http:\/\/(?:localhost|127\.0\.0\.1|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/.test(
      normalizedOrigin,
    )
  ) {
    return callback(null, true);
  }

  console.error('CORS blocked origin:', {
    received: normalizedOrigin,
    allowed: [...allowedOrigins],
  });

  return callback(
    new Error(`CORS blocked origin: ${normalizedOrigin}`),
  );
}

const io = new Server(server, {
  cors: { origin: isAllowedOrigin, credentials: true },
  maxHttpBufferSize: 10e6,
  pingTimeout: 30_000
});
app.set('io', io);

app.set('trust proxy', 1);
const jitsiOrigin = (() => {
  const raw = String(
    process.env.JITSI_SERVER_URL ||
    process.env.VITE_JITSI_SERVER_URL ||
    'https://42.96.12.227',
  )
    .trim()
    .replace(/\/+$/, '');

  try {
    return new URL(raw).origin;
  } catch {
    return 'https://42.96.12.227';
  }
})();
const mirotalkOrigin = (() => {
  const raw = String(
    process.env.MIROTALK_BRO_PUBLIC_URL ||
    process.env.MIROTALK_BRO_URL ||
    'https://bro.mirotalk.com',
  )
    .trim()
    .replace(/\/+$/, '');

  try {
    return new URL(raw).origin;
  } catch {
    return 'https://bro.mirotalk.com';
  }
})();
const jitsiWebSocketOrigin = jitsiOrigin
  .replace(/^https:/, 'wss:')
  .replace(/^http:/, 'ws:');

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },

    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        scriptSrc: [
          "'self'",
          jitsiOrigin,
        ],

        scriptSrcElem: [
          "'self'",
          jitsiOrigin,
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https:',
        ],

        styleSrcElem: [
          "'self'",
          "'unsafe-inline'",
          'https:',
        ],

        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https:',
        ],

        fontSrc: [
          "'self'",
          'data:',
          'https:',
        ],

        connectSrc: [
          "'self'",
          jitsiOrigin,
          jitsiWebSocketOrigin,
        ],

        frameSrc: [
          "'self'",
          jitsiOrigin,
          mirotalkOrigin,
        ],

        childSrc: [
          "'self'",
          jitsiOrigin,
          mirotalkOrigin,
          'blob:',
        ],

        mediaSrc: [
          "'self'",
          'blob:',
          jitsiOrigin,
        ],

        workerSrc: [
          "'self'",
          'blob:',
        ],

        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  }),
);
app.use(
  '/api',
  cors({
    origin: isAllowedOrigin,
    credentials: true,
  }),
); app.use(express.json({ limit: '10mb' }));
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

