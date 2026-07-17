import crypto from 'node:crypto';
import { env } from '../config/env.js';

let agoraLibraryPromise;

async function loadAgoraLibrary() {
  agoraLibraryPromise ||= import('agora-access-token').then((module) => module.default || module);
  return agoraLibraryPromise;
}

function safeChannel(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);

  if (!cleaned) {
    throw Object.assign(new Error('Không tạo được Agora channel.'), { status: 500 });
  }

  return cleaned;
}

function uidFromUser({ userId, callSessionId }) {
  const digest = crypto
    .createHash('sha256')
    .update(`${String(callSessionId)}:${String(userId)}`)
    .digest();

  const value = digest.readUInt32BE(0);
  return value === 0 ? 1 : value;
}

export async function buildAgoraRtcCredentials({ callSessionId, userId }) {
  const appId = String(env.agoraAppId || '').trim();
  const appCertificate = String(env.agoraAppCertificate || '').trim();

  if (!appId || !appCertificate) {
    throw Object.assign(
      new Error(
        'Agora chưa được cấu hình trên backend. Cần AGORA_APP_ID và AGORA_APP_CERTIFICATE trong .env.',
      ),
      { status: 500 },
    );
  }

  const ttlSeconds = Math.min(
    24 * 60 * 60,
    Math.max(300, Number(env.agoraTokenTtlSeconds || 3600)),
  );

  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const channel = safeChannel(`nexora-call-${callSessionId}`);
  const uid = uidFromUser({ userId, callSessionId });

  const { RtcTokenBuilder, RtcRole } = await loadAgoraLibrary();

  if (!RtcTokenBuilder || !RtcRole) {
    throw Object.assign(
      new Error('Không tải được Agora token builder trên backend.'),
      { status: 500 },
    );
  }

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    expiresAtSeconds,
  );

  return {
    provider: 'agora',
    appId,
    token,
    channel,
    uid,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}
