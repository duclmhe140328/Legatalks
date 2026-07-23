import 'dotenv/config';

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') throw new Error(`Missing environment variable: ${name}`);
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_connect',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  clientUrls: String(process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',').map((item) => item.trim()).filter(Boolean),
  publicServerUrl: process.env.PUBLIC_SERVER_URL || 'http://localhost:4000',
  uploadDir: process.env.UPLOAD_DIR || '',
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenDays: Math.max(3650, Number(process.env.REFRESH_TOKEN_DAYS || 3650)),
  otpProvider: process.env.OTP_PROVIDER || 'console',
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 5),
  otpDevCode: process.env.OTP_DEV_CODE || '123456',
  rpId: process.env.RP_ID || 'localhost',
  rpName: process.env.RP_NAME || 'Nexora Connect',
  expectedOrigin: process.env.EXPECTED_ORIGIN || 'http://localhost:5173',
  webhookSigningSecret: process.env.WEBHOOK_SIGNING_SECRET || 'dev-webhook-secret',
  stunUrls: String(process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(',').map((item) => item.trim()).filter(Boolean),
  turnUrls: String(process.env.TURN_URLS || process.env.TURN_URL || '').split(',').map((item) => item.trim()).filter(Boolean),
  turnUrl: process.env.TURN_URL || '',
  turnUsername: process.env.TURN_USERNAME || '',
  turnCredential: process.env.TURN_CREDENTIAL || '',
  paymentProvider: process.env.PAYMENT_PROVIDER || 'mock',
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'dev-payment-secret',
  jitsiDomain: process.env.JITSI_DOMAIN || '42.96.12.227',
  jitsiJwt: process.env.JITSI_JWT || '',
  jitsiLanguage: process.env.JITSI_LANGUAGE || 'vi'
};
