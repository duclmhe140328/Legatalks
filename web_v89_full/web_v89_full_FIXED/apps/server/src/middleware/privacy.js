const SENSITIVE_KEYS = new Set([
  'phone',
  'phoneNumber',
  'contactHashes',
  'passwordHash',
  'refreshTokenHash',
  'webauthnChallenge',
  'sessions',
  'passkeys',
  'pushToken',
  'pushTokens',
  'deviceToken',
]);

function canReturnPrivatePhone(req) {
  const path = req.originalUrl || req.url || '';
  const method = String(req.method || 'GET').toUpperCase();

  // Allow only the current user's own profile to keep phone if the app needs it.
  if (method === 'GET' && /^\/api\/users\/me(?:\?|$)/.test(path)) return true;

  // Keep auth responses to avoid breaking login/register/refresh flow.
  if (/^\/api\/auth\/(login|register|refresh)(?:\/|\?|$)/.test(path)) return true;

  return false;
}

function toPlain(value) {
  if (!value) return value;

  if (typeof value.toObject === 'function') {
    return value.toObject({ virtuals: true, depopulate: false });
  }

  if (typeof value.toJSON === 'function' && value.constructor?.name !== 'Object') {
    try {
      return value.toJSON();
    } catch (_) {
      return value;
    }
  }

  return value;
}

export function scrubSensitive(value, options = {}, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  const plain = toPlain(value);

  if (Array.isArray(plain)) {
    return plain.map((item) => scrubSensitive(item, options, seen));
  }

  if (plain === null || typeof plain !== 'object') return plain;

  if (seen.has(plain)) return undefined;
  seen.add(plain);

  const output = {};

  for (const [key, child] of Object.entries(plain)) {
    if (SENSITIVE_KEYS.has(key)) {
      if (key === 'phone' && options.allowPhone === true) {
        output[key] = child;
      }
      continue;
    }

    output[key] = scrubSensitive(child, options, seen);
  }

  return output;
}

export function privacyResponseGuard(req, res, next) {
  const originalJson = res.json.bind(res);

  // IMPORTANT:
  // Do not override res.send here.
  // Express res.json internally calls res.send, and overriding both can cause
  // "ERR_HTTP_HEADERS_SENT: Cannot set headers after they are sent".
  res.json = function guardedJson(payload) {
    if (res.headersSent) return res;
    const allowPhone = canReturnPrivatePhone(req);
    return originalJson(scrubSensitive(payload, { allowPhone }));
  };

  next();
}

export default privacyResponseGuard;
