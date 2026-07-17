import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { env } from '../config/env.js';

export const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function createAccessToken(user, sessionId) {
  return jwt.sign(
    { sub: user._id.toString(), sid: sessionId, type: 'access' },
    env.jwtAccessSecret,
    { expiresIn: env.accessTokenTtl }
  );
}

export function createRefreshToken(user, sessionId) {
  return jwt.sign(
    { sub: user._id.toString(), sid: sessionId, nonce: nanoid(), type: 'refresh' },
    env.jwtRefreshSecret,
    { expiresIn: `${env.refreshTokenDays}d` }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}
