import { nanoid } from 'nanoid';
import { createAccessToken, createRefreshToken, hashToken } from '../utils/tokens.js';

export async function createSession(user, req, device = {}) {
  const sessionId = nanoid(24);
  const refreshToken = createRefreshToken(user, sessionId);
  user.sessions.push({
    _id: sessionId,
    deviceId: device.deviceId || nanoid(12),
    deviceName: device.deviceName || 'Thiết bị không xác định',
    userAgent: req.headers['user-agent'] || '',
    ip: req.ip,
    refreshTokenHash: hashToken(refreshToken),
    pushToken: device.pushToken || '',
    pushPlatform: device.pushPlatform || undefined,
    pushEnvironment: device.pushEnvironment || 'development',
    lastSeenAt: new Date()
  });
  await user.save();
  return {
    accessToken: createAccessToken(user, sessionId),
    refreshToken,
    sessionId,
    user: user.toSafeJSON()
  };
}
