import express from 'express';
import Notification from '../models/Notification.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(5, Number.parseInt(req.query.limit, 10) || 20));
  const query = { recipient: req.user._id };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', 'displayName avatar'),
    Notification.countDocuments(query),
    Notification.countDocuments({ ...query, readAt: null })
  ]);

  res.json({
    items,
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasPrevious: page > 1,
      hasNext: page * limit < total
    }
  });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipient: req.user._id, readAt: null }, { readAt: new Date() });
  res.json({ message: 'Đã đánh dấu tất cả là đã đọc.' });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const item = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { readAt: new Date() },
    { new: true }
  ).populate('actor', 'displayName avatar');
  if (!item) return res.status(404).json({ message: 'Không tìm thấy thông báo.' });
  res.json(item);
}));

export default router;
