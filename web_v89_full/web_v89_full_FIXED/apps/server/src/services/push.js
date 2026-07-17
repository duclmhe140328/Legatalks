import crypto from 'node:crypto';
import http2 from 'node:http2';
import webPush from 'web-push';
import { JWT } from 'google-auth-library';
import User from '../models/User.js';
import WebPushSubscription from '../models/WebPushSubscription.js';

const base64url = (value) => Buffer.from(value).toString('base64url');

function plainData(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (typeof value.toObject === 'function') return value.toObject();
  return value;
}

function notificationPayload(notification) {
  const rawData = plainData(notification.data);
  const data = Object.fromEntries(
    Object.entries(rawData || {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );

  if (!data.path) {
    if (data.conversationId) data.path = '/chats';
    else if (data.meetingId) data.path = `/meetings/${data.meetingId}`;
    else if (data.postId) data.path = `/timeline?post=${data.postId}`;
    else data.path = '/notifications';
  }

  if (notification._id) data.notificationId = String(notification._id);
  if (notification.type) data.type = String(notification.type);

  return {
    title: notification.title || 'Nexora Connect',
    body: notification.body || '',
    data
  };
}

async function sendExpoPush(tokens, notification) {
  const expoTokens = tokens.filter((token) => /^Expo(nent)?PushToken\[/i.test(String(token || '')));
  if (!expoTokens.length) return;
  const payload = notificationPayload(notification);
  const chunks = [];
  for (let i = 0; i < expoTokens.length; i += 90) chunks.push(expoTokens.slice(i, i + 90));
  await Promise.allSettled(chunks.map((chunk) => fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(chunk.map((to) => ({
      to,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data,
      priority: 'high',
      channelId: 'default'
    })))
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Expo Push ${response.status}: ${await response.text()}`);
  })));
}

async function sendFcm(tokens, notification) {
  const fcmTokens = tokens.filter((token) => !/^Expo(nent)?PushToken\[/i.test(String(token || '')));
  if (!fcmTokens.length || !process.env.FCM_SERVICE_ACCOUNT_JSON) return;
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON.trim();
  const serviceAccount = raw.startsWith('{') ? JSON.parse(raw) : JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  });
  const { token } = await auth.getAccessToken();
  const payload = notificationPayload(notification);
  await Promise.allSettled(fcmTokens.map((deviceToken) => fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token: deviceToken, notification: { title: payload.title, body: payload.body }, data: payload.data } })
    }
  ).then(async (response) => {
    if (!response.ok) throw new Error(`FCM ${response.status}: ${await response.text()}`);
  })));
}

function createApnsJwt() {
  const teamId = process.env.APNS_TEAM_ID;
  const keyId = process.env.APNS_KEY_ID;
  const privateKey = (process.env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!teamId || !keyId || !privateKey) return null;
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${claims}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${signingInput}.${signature}`;
}

async function sendApns(tokens, notification) {
  const topic = process.env.APNS_BUNDLE_ID;
  const jwt = createApnsJwt();
  if (!tokens.length || !topic || !jwt) return;
  const production = String(process.env.APNS_PRODUCTION).toLowerCase() === 'true';
  const origin = production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  const payload = notificationPayload(notification);

  await Promise.allSettled(tokens.map((deviceToken) => new Promise((resolve, reject) => {
    const client = http2.connect(origin);
    client.on('error', reject);
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json'
    });
    let body = '';
    req.setEncoding('utf8');
    req.on('response', (headers) => {
      const status = Number(headers[':status']);
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        client.close();
        status >= 200 && status < 300 ? resolve() : reject(new Error(`APNs ${status}: ${body}`));
      });
    });
    req.on('error', (error) => { client.close(); reject(error); });
    req.end(JSON.stringify({ aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' }, ...payload.data }));
  })));
}

function configureWebPush() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.VAPID_SUBJECT || 'mailto:admin@nexora.local').trim();
  if (!publicKey || !privateKey) return false;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function sendWebPush(userId, notification) {
  if (!configureWebPush()) return;
  const subscriptions = await WebPushSubscription.find({ user: userId }).lean();
  if (!subscriptions.length) return;

  const payload = notificationPayload(notification);
  const body = JSON.stringify(payload);

  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime || null,
        keys: subscription.keys
      }, body, {
        TTL: 60 * 60,
        urgency: 'high'
      });
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await WebPushSubscription.deleteOne({ _id: subscription._id });
        return;
      }
      throw error;
    }
  }));
}

export async function sendPushToUser(userId, notification) {
  const user = await User.findById(userId).select('sessions');
  if (!user) return;
  const active = user.sessions.filter((session) => session.pushToken && !session.revokedAt);
  const androidTokens = active
    .filter((session) => session.pushPlatform === 'android')
    .map((session) => session.pushToken);
  const iosTokens = active
    .filter((session) => session.pushPlatform === 'ios')
    .map((session) => session.pushToken);

  await Promise.allSettled([
    sendExpoPush(androidTokens, notification),
    sendFcm(androidTokens, notification),
    sendApns(iosTokens, notification),
    sendWebPush(userId, notification)
  ]);
}
