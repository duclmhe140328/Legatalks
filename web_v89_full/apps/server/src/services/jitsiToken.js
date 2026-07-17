import jwt from 'jsonwebtoken';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    throw Object.assign(
      new Error(`Missing required environment variable: ${name}`),
      { status: 500 },
    );
  }

  return value;
}

function stripTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function normalizeJitsiDomain(value) {
  const raw = String(value || '').trim();

  if (!raw) return '';

  try {
    return new URL(
      raw.startsWith('http://') || raw.startsWith('https://')
        ? raw
        : `https://${raw}`,
    ).hostname;
  } catch {
    return raw
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .trim();
  }
}

export function normalizeJitsiRoom(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

export function getJitsiPublicConfig() {
  const domain = normalizeJitsiDomain(
    process.env.JITSI_DOMAIN ||
      process.env.JITSI_SERVER_URL ||
      '42.96.12.227',
  );

  const serverUrl = stripTrailingSlash(
    process.env.JITSI_SERVER_URL || `https://${domain}`,
  );

  return {
    domain,
    serverUrl,
    appId: requiredEnv('JITSI_APP_ID'),
    tokenTtlSeconds: Math.max(
      300,
      Number(process.env.JITSI_TOKEN_TTL_SECONDS || 3600),
    ),
  };
}

export function createJitsiToken({
  room,
  user,
  moderator = false,
}) {
  const safeRoom = normalizeJitsiRoom(room);

  if (!safeRoom) {
    throw Object.assign(new Error('Invalid Jitsi room.'), { status: 400 });
  }

  const {
    domain,
    appId,
    tokenTtlSeconds,
  } = getJitsiPublicConfig();

  const appSecret = requiredEnv('JITSI_APP_SECRET');
  const now = Math.floor(Date.now() / 1000);

  const userId = String(user?._id || user?.id || '');
  const displayName = String(
    user?.displayName ||
      user?.name ||
      user?.username ||
      'Nexora User',
  );

  const payload = {
    aud: appId,
    iss: appId,
    sub: domain,
    room: safeRoom,
    nbf: now - 10,
    iat: now,
    exp: now + tokenTtlSeconds,

    context: {
      user: {
        id: userId,
        name: displayName,
        email: String(user?.email || ''),
        avatar: String(user?.avatar || ''),
        moderator: moderator ? 'true' : 'false',
      },

      features: {
        livestreaming: Boolean(moderator),
        recording: Boolean(moderator),
        transcription: Boolean(moderator),
        'outbound-call': false,
        'create-polls': true,
        'file-upload': Boolean(moderator),
        'send-groupchat': true,
        flip: true,
      },
    },
  };

  return {
    token: jwt.sign(payload, appSecret, {
      algorithm: 'HS256',
      noTimestamp: true,
    }),
    room: safeRoom,
    expiresAt: new Date((now + tokenTtlSeconds) * 1000).toISOString(),
    expiresIn: tokenTtlSeconds,
  };
}
