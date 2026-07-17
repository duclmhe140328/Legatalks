import crypto from 'crypto';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signHs256(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signingInput}.${signature}`;
}

export function safeJitsiRoom(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .slice(0, 180);
}

function absoluteAvatar(value) {
  const avatar = String(value || '').trim();
  if (!avatar) return '';
  if (/^https?:\/\//i.test(avatar)) return avatar;
  const origin = String(process.env.PUBLIC_SERVER_URL || '').replace(/\/$/, '');
  if (!origin) return avatar;
  return `${origin}${avatar.startsWith('/') ? '' : '/'}${avatar}`;
}

export function createJitsiJoinConfig({ room, user, moderator = false, purpose = 'meeting' }) {
  const serverUrl = String(process.env.JITSI_SERVER_URL || 'https://42.96.12.227').replace(/\/$/, '');
  const domain = String(process.env.JITSI_DOMAIN || '42.96.12.227').trim();
  const appId = required('JITSI_APP_ID');
  const appSecret = required('JITSI_APP_SECRET');
  const ttl = Math.min(86400, Math.max(300, Number(process.env.JITSI_TOKEN_TTL_SECONDS || 3600)));
  const safeRoom = safeJitsiRoom(room);
  if (!safeRoom) throw new Error('Invalid Jitsi room.');

  const now = Math.floor(Date.now() / 1000);
  const userId = String(user?._id || user?.id || '');
  const displayName = String(user?.displayName || user?.name || user?.username || 'Nexora user');
  const email = String(user?.email || `${userId || 'guest'}@nexora.local`);

  const payload = {
    aud: appId,
    iss: appId,
    sub: domain,
    room: safeRoom,
    nbf: now - 10,
    iat: now,
    exp: now + ttl,
    context: {
      user: {
        id: userId,
        name: displayName,
        email,
        avatar: absoluteAvatar(user?.avatar),
        moderator: Boolean(moderator),
      },
      features: {
        livestreaming: purpose !== 'call',
        recording: purpose !== 'call',
        transcription: purpose !== 'call',
        'outbound-call': false,
      },
    },
    moderator: Boolean(moderator),
  };

  return {
    provider: 'jitsi',
    serverUrl,
    domain,
    room: safeRoom,
    token: signHs256(payload, appSecret),
    expiresAt: new Date((now + ttl) * 1000).toISOString(),
    purpose,
    user: {
      id: userId,
      displayName,
      email,
      avatar: absoluteAvatar(user?.avatar),
      moderator: Boolean(moderator),
    },
  };
}
