import express from 'express';
import WebPushSubscription from '../models/WebPushSubscription.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(requireAuth);

router.get('/public-key', (_req, res) => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  if (!publicKey) return res.status(503).json({ message: 'Backend chưa cấu hình VAPID_PUBLIC_KEY.' });
  return res.json({ publicKey });
});

router.post('/subscribe', asyncHandler(async (req, res) => {
  const subscription = req.body?.subscription || {};
  const endpoint = String(subscription.endpoint || '').trim();
  const p256dh = String(subscription.keys?.p256dh || '').trim();
  const auth = String(subscription.keys?.auth || '').trim();

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ message: 'Web Push subscription không hợp lệ.' });
  }

  const item = await WebPushSubscription.findOneAndUpdate(
    { endpoint },
    {
      user: req.user._id,
      endpoint,
      expirationTime: Number.isFinite(subscription.expirationTime) ? subscription.expirationTime : null,
      keys: { p256dh, auth },
      userAgent: String(req.body?.userAgent || req.headers['user-agent'] || ''),
      lastSeenAt: new Date()
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return res.json({ message: 'Đã bật thông báo nền cho thiết bị này.', id: item._id });
}));

router.delete('/subscribe', asyncHandler(async (req, res) => {
  const endpoint = String(req.body?.endpoint || '').trim();
  if (endpoint) await WebPushSubscription.deleteOne({ endpoint, user: req.user._id });
  return res.json({ message: 'Đã tắt thông báo nền cho thiết bị này.' });
}));

export default router;
