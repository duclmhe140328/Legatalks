import express from 'express';
import Story from '../models/Story.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createNotification } from '../services/notifications.js';
import { hiddenUserIdsFor, usersAreBlocked } from '../utils/socialAccess.js';

const router = express.Router();
router.use(requireAuth);
const authorFields = 'displayName avatar accountType verified';
const populateStory = (query) => query.populate('author', authorFields).populate('viewers.user', authorFields).populate('reactions.user', authorFields).populate('replies.user', authorFields);

async function canViewStory(story, viewer) {
  if (!story || story.isDeleted || story.expiresAt <= new Date()) return false;
  const authorId = story.author?._id || story.author;
  if (String(authorId) === String(viewer._id)) return true;
  if (await usersAreBlocked(viewer, authorId)) return false;
  if (story.privacy === 'public') return true;
  return story.privacy === 'friends' && (viewer.friends || []).some((id) => String(id) === String(authorId));
}

router.get('/', asyncHandler(async (req, res) => {
  const hiddenAuthors = await hiddenUserIdsFor(req.user);
  const visibleAuthors = [...req.user.friends, req.user._id];
  const stories = await populateStory(Story.find({
    isDeleted: false, expiresAt: { $gt: new Date() },
    author: { $nin: hiddenAuthors },
    $or: [{ privacy: 'public' }, { privacy: 'friends', author: { $in: visibleAuthors } }, { author: req.user._id }]
  }).sort({ createdAt: -1 }).limit(100));
  res.json(stories);
}));

router.post('/', asyncHandler(async (req, res) => {
  const media = Array.isArray(req.body.media) ? req.body.media.filter((item) => item?.url).slice(0, 1) : [];
  if (!String(req.body.text || '').trim() && media.length === 0) return res.status(400).json({ message: 'Story cần ảnh, video hoặc chữ.' });
  const story = await Story.create({
    author: req.user._id, text: req.body.text || '', media,
    privacy: req.body.privacy === 'public' ? 'public' : 'friends',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });
  res.status(201).json(await populateStory(Story.findById(story._id)));
}));



router.post('/:id/view', asyncHandler(async (req, res) => {
  const story = await Story.findOne({
    _id: req.params.id,
    isDeleted: false,
    expiresAt: { $gt: new Date() }
  });

  if (!story) return res.status(404).json({ message: 'Không tìm thấy story.' });

  const isOwner = String(story.author) === String(req.user._id);
  if (!(await canViewStory(story, req.user))) return res.status(403).json({ message: 'Bạn không có quyền xem story này.' });

  if (!isOwner) {
    await Story.updateOne(
      { _id: story._id, 'viewers.user': { $ne: req.user._id } },
      { $push: { viewers: { user: req.user._id, viewedAt: new Date() } } }
    );
  }

  res.json(await populateStory(Story.findById(story._id)));
}));

router.post('/:id/react', asyncHandler(async (req, res) => {
  const story = await Story.findOne({ _id: req.params.id, isDeleted: false, expiresAt: { $gt: new Date() } });
  if (!story || !(await canViewStory(story, req.user))) return res.status(404).json({ message: 'Không tìm thấy story.' });
  const emoji = String(req.body.emoji || '👍').slice(0, 8);
  const old = story.reactions.find((item) => String(item.user) === String(req.user._id));
  if (old) old.emoji = emoji; else story.reactions.push({ user: req.user._id, emoji });
  await story.save();
  if (String(story.author) !== String(req.user._id)) await createNotification(req.app.get('io'), {
    recipient: story.author, actor: req.user._id, type: 'story_reaction', title: 'React story mới', body: `${req.user.displayName} đã react story của bạn.`, data: { storyId: story._id }
  });
  res.json(await populateStory(Story.findById(story._id)));
}));

router.post('/:id/replies', asyncHandler(async (req, res) => {
  const story = await Story.findOne({ _id: req.params.id, isDeleted: false, expiresAt: { $gt: new Date() } });
  if (!story || !(await canViewStory(story, req.user))) return res.status(404).json({ message: 'Không tìm thấy story.' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ message: 'Nội dung trả lời trống.' });
  story.replies.push({ user: req.user._id, text });
  await story.save();
  if (String(story.author) !== String(req.user._id)) await createNotification(req.app.get('io'), {
    recipient: story.author, actor: req.user._id, type: 'story_reply', title: 'Trả lời story mới', body: `${req.user.displayName}: ${text.slice(0, 90)}`, data: { storyId: story._id }
  });
  res.status(201).json(await populateStory(Story.findById(story._id)));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const story = await Story.findOne({ _id: req.params.id, author: req.user._id });
  if (!story) return res.status(404).json({ message: 'Không tìm thấy story.' });
  story.isDeleted = true; await story.save();
  res.json({ message: 'Đã xóa story.' });
}));

export default router;
