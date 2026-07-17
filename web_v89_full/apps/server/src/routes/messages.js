import express from 'express';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createMessage, ensureMember } from '../services/messageService.js';
import { ensureCallMessagesForConversation, getCallChatEvents } from '../services/callLifecycle.js';

const router = express.Router();
router.use(requireAuth);

router.get('/:conversationId', asyncHandler(async (req, res) => {
  await ensureMember(req.params.conversationId, req.user._id);
  await ensureCallMessagesForConversation({
    io: req.app.get('io'),
    conversationId: req.params.conversationId
  });

  const limit = Math.min(Number(req.query.limit || 60), 150);
  const query = {
    conversation: req.params.conversationId,
    deletedFor: { $ne: req.user._id }
  };
  if (req.query.before) query.createdAt = { $lt: new Date(req.query.before) };
  if (req.query.kind) query.kind = req.query.kind;
  if (req.query.search) query.$text = { $search: String(req.query.search) };

  const populateMessage = (cursor) => cursor
    .populate('sender', 'displayName avatar accountType verified')
    .populate('reactions.user', 'displayName avatar')
    .populate({ path: 'replyTo', populate: { path: 'sender', select: 'displayName avatar' } });

  const recent = await populateMessage(Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit));

  let combined = [...recent].reverse();
  if (!req.query.search && !req.query.kind) {
    const callEvents = await getCallChatEvents(req.params.conversationId);
    const regularMessages = combined.filter((message) => !(message.kind === 'system' && message.metadata?.type === 'call'));
    combined = [...regularMessages, ...callEvents]
      .filter((message) => !req.query.before || new Date(message.createdAt) < new Date(req.query.before))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  res.json(combined);
}));

router.post('/', asyncHandler(async (req, res) => {
  const message = await createMessage({ io: req.app.get('io'), userId: req.user._id, payload: req.body });
  res.status(201).json(message);
}));

router.patch('/:id/reaction', asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message) return res.status(404).json({ message: 'Không tìm thấy tin nhắn.' });
  await ensureMember(message.conversation, req.user._id);
  message.reactions = message.reactions.filter((r) => String(r.user) !== String(req.user._id));
  if (req.body.emoji) message.reactions.push({ user: req.user._id, emoji: req.body.emoji });
  await message.save();
  const populated = await Message.findById(message._id).populate('reactions.user', 'displayName avatar');
  req.app.get('io').to(`conversation:${message.conversation}`).emit('message:reaction', populated);
  res.json(populated.reactions);
}));

router.post('/:id/revoke', asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message) return res.status(404).json({ message: 'Không tìm thấy tin nhắn.' });
  const conversation = await ensureMember(message.conversation, req.user._id);
  const me = conversation.members.find((m) => String(m.user) === String(req.user._id));
  const canModerate = conversation.type === 'group' && ['owner', 'admin'].includes(me.role);
  if (String(message.sender) !== String(req.user._id) && !canModerate) return res.status(403).json({ message: 'Không có quyền thu hồi.' });
  message.revokedAt = new Date();
  message.text = '';
  message.media = [];
  await message.save();
  req.app.get('io').to(`conversation:${message.conversation}`).emit('message:revoked', { messageId: message._id, conversationId: message.conversation });
  res.json({ message: 'Đã thu hồi.' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message) return res.status(404).json({ message: 'Không tìm thấy tin nhắn.' });
  await ensureMember(message.conversation, req.user._id);
  message.deletedFor.addToSet(req.user._id);
  await message.save();
  res.json({ message: 'Đã xóa tin nhắn phía bạn.' });
}));

router.post('/:conversationId/read', asyncHandler(async (req, res) => {
  await ensureMember(req.params.conversationId, req.user._id);
  const now = new Date();
  await Message.updateMany(
    { conversation: req.params.conversationId, sender: { $ne: req.user._id }, 'receipts.user': req.user._id, 'receipts.readAt': null },
    { $set: { 'receipts.$[receipt].deliveredAt': now, 'receipts.$[receipt].readAt': now } },
    { arrayFilters: [{ 'receipt.user': req.user._id }] }
  );
  req.app.get('io').to(`conversation:${req.params.conversationId}`).emit('message:read', {
    conversationId: req.params.conversationId,
    userId: req.user._id,
    readAt: now
  });
  res.json({ readAt: now });
}));

export default router;
