import express from 'express';
import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { Webhook, BotRule, MiniApp, Payment } from '../models/Integration.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';

const router = express.Router();
router.use(requireAuth);

function requireOfficial(req, res, next) {
  if (req.user.accountType !== 'official') return res.status(403).json({ message: 'Chức năng chỉ dành cho Official Account.' });
  next();
}

router.post('/official/enable', asyncHandler(async (req, res) => {
  req.user.accountType = 'official';
  req.user.officialCategory = req.body.category || 'Doanh nghiệp';
  await req.user.save();
  res.json(req.user.toSafeJSON());
}));

router.post('/official/:id/follow', asyncHandler(async (req, res) => {
  const official = await User.findOne({ _id: req.params.id, accountType: 'official' });
  if (!official) return res.status(404).json({ message: 'Không tìm thấy Official Account.' });
  const following = req.user.followingOfficial.some((id) => String(id) === String(official._id));
  if (following) {
    req.user.followingOfficial.pull(official._id);
    official.followers.pull(req.user._id);
  } else {
    req.user.followingOfficial.addToSet(official._id);
    official.followers.addToSet(req.user._id);
  }
  await Promise.all([req.user.save(), official.save()]);
  res.json({ following: !following, followers: official.followers.length });
}));

router.post('/official/broadcast', requireOfficial, asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const followers = await User.find({ _id: { $in: req.user.followers }, isActive: true }).select('_id');
  let sent = 0;
  for (const follower of followers) {
    const key = [String(req.user._id), String(follower._id)].sort().join(':');
    let conversation = await Conversation.findOne({ directKey: key });
    if (!conversation) {
      conversation = await Conversation.create({
        type: 'official',
        directKey: key,
        members: [{ user: req.user._id, role: 'owner' }, { user: follower._id, role: 'member' }],
        createdBy: req.user._id,
        officialAccount: req.user._id
      });
    }
    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      kind: req.body.kind || 'text',
      text: req.body.text || '',
      media: req.body.media || [],
      metadata: { broadcast: true }
    });
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;
    await conversation.save();
    const populated = await Message.findById(message._id).populate('sender', 'displayName avatar accountType verified');
    io.to(`conversation:${conversation._id}`).emit('message:new', populated);
    io.to(`user:${follower._id}`).emit('conversation:new-message', { conversationId: conversation._id });
    sent += 1;
  }
  res.json({ message: 'Đã broadcast.', sent });
}));

router.get('/webhooks', requireOfficial, asyncHandler(async (req, res) => {
  res.json(await Webhook.find({ owner: req.user._id }).sort({ createdAt: -1 }));
}));
router.post('/webhooks', requireOfficial, asyncHandler(async (req, res) => {
  const item = await Webhook.create({
    owner: req.user._id,
    name: req.body.name,
    url: req.body.url,
    secret: req.body.secret || crypto.randomBytes(24).toString('hex'),
    events: req.body.events || ['message.created']
  });
  res.status(201).json(item);
}));
router.delete('/webhooks/:id', requireOfficial, asyncHandler(async (req, res) => {
  await Webhook.deleteOne({ _id: req.params.id, owner: req.user._id });
  res.json({ message: 'Đã xóa webhook.' });
}));

router.get('/bot-rules', requireOfficial, asyncHandler(async (req, res) => {
  res.json(await BotRule.find({ owner: req.user._id }).sort({ createdAt: -1 }));
}));
router.post('/bot-rules', requireOfficial, asyncHandler(async (req, res) => {
  const item = await BotRule.create({
    owner: req.user._id,
    name: req.body.name,
    matchType: req.body.matchType || 'contains',
    pattern: req.body.pattern,
    responseText: req.body.responseText
  });
  res.status(201).json(item);
}));
router.patch('/bot-rules/:id', requireOfficial, asyncHandler(async (req, res) => {
  const item = await BotRule.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, req.body, { new: true, runValidators: true });
  res.json(item);
}));
router.delete('/bot-rules/:id', requireOfficial, asyncHandler(async (req, res) => {
  await BotRule.deleteOne({ _id: req.params.id, owner: req.user._id });
  res.json({ message: 'Đã xóa luật chatbot.' });
}));

router.get('/mini-apps', asyncHandler(async (req, res) => {
  const items = await MiniApp.find({ $or: [{ isPublished: true }, { owner: req.user._id }] }).populate('owner', 'displayName avatar verified');
  res.json(items);
}));
router.post('/mini-apps', requireOfficial, asyncHandler(async (req, res) => {
  const item = await MiniApp.create({
    owner: req.user._id,
    name: req.body.name,
    description: req.body.description || '',
    icon: req.body.icon || '',
    launchUrl: req.body.launchUrl,
    allowedOrigins: req.body.allowedOrigins || [],
    scopes: req.body.scopes || ['profile'],
    isPublished: Boolean(req.body.isPublished)
  });
  res.status(201).json(item);
}));
router.patch('/mini-apps/:id', requireOfficial, asyncHandler(async (req, res) => {
  const item = await MiniApp.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, req.body, { new: true, runValidators: true });
  res.json(item);
}));

router.post('/payments/create', asyncHandler(async (req, res) => {
  const orderId = req.body.orderId || `NX-${Date.now()}-${nanoid(6).toUpperCase()}`;
  const payment = await Payment.create({
    user: req.user._id,
    miniApp: req.body.miniAppId || undefined,
    orderId,
    amount: Number(req.body.amount),
    currency: req.body.currency || 'VND',
    provider: env.paymentProvider,
    metadata: req.body.metadata || {}
  });
  res.status(201).json({
    payment,
    checkoutUrl: env.paymentProvider === 'mock' ? `${env.clientUrl}/mini-apps?payment=${payment._id}` : null
  });
}));

router.post('/payments/:id/mock-confirm', asyncHandler(async (req, res) => {
  if (env.paymentProvider !== 'mock') return res.status(400).json({ message: 'Endpoint chỉ dùng cho mock payment.' });
  const payment = await Payment.findOne({ _id: req.params.id, user: req.user._id });
  if (!payment) return res.status(404).json({ message: 'Không tìm thấy giao dịch.' });
  payment.status = req.body.success === false ? 'failed' : 'paid';
  payment.providerTransactionId = `MOCK-${nanoid(12)}`;
  payment.paidAt = payment.status === 'paid' ? new Date() : undefined;
  await payment.save();
  res.json(payment);
}));

router.get('/payments/:id', asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, user: req.user._id });
  if (!payment) return res.status(404).json({ message: 'Không tìm thấy giao dịch.' });
  res.json(payment);
}));

export default router;
