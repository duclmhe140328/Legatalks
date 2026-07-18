import express from 'express';
import Post from '../models/Post.js';
import CommunityGroup from '../models/CommunityGroup.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createNotification } from '../services/notifications.js';

const router = express.Router();
router.use(requireAuth);
const authorFields = 'displayName avatar accountType verified';

const populatePost = (query) => query
  .populate('author', authorFields)
  .populate('comments.user', authorFields)
  .populate('group', 'name avatar privacy members owner admins conversation')
  .populate({
    path: 'repostOf',
    populate: [
      { path: 'author', select: authorFields },
      { path: 'comments.user', select: authorFields }
    ]
  });

async function canView(post, viewer) {
  if (!post || post.isDeleted) return false;
  if (String(post.author?._id || post.author) === String(viewer._id)) return true;
  if (post.group) {
    const groupId = post.group?._id || post.group;
    const group = post.group?.members ? post.group : await CommunityGroup.findById(groupId).select('privacy members owner admins');
    if (!group) return false;
    const isMember = group.members.some((id) => String(id?._id || id) === String(viewer._id));
    return group.privacy === 'public' || isMember || String(group.owner?._id || group.owner) === String(viewer._id);
  }
  if (post.privacy === 'public') return true;
  const isFriend = viewer.friends.some((id) => String(id) === String(post.author?._id || post.author));
  if (post.privacy === 'friends') return isFriend;
  if (post.privacy === 'except') return isFriend && !post.excludedUsers.some((id) => String(id) === String(viewer._id));
  return false;
}

router.get('/feed', asyncHandler(async (req, res) => {
  const visibleAuthors = [...req.user.friends, req.user._id];
  const [memberGroupIds, publicGroupIds] = await Promise.all([
    CommunityGroup.find({ members: req.user._id, isActive: true }).distinct('_id'),
    CommunityGroup.find({ privacy: 'public', isActive: true }).distinct('_id')
  ]);
  const visibleGroupIds = [...new Set([...memberGroupIds, ...publicGroupIds].map(String))];
  const query = {
    isDeleted: false,
    $or: [
      { privacy: 'public', group: null },
      { author: { $in: visibleAuthors }, privacy: 'friends', group: null },
      { author: req.user._id },
      { privacy: 'except', author: { $in: visibleAuthors }, excludedUsers: { $ne: req.user._id }, group: null },
      { group: { $in: visibleGroupIds } }
    ]
  };
  if (req.query.type === 'video') {
    query.$and = [{ $or: [
      { contentType: 'video' },
      { 'media.type': 'video' },
      { text: /(?:youtube\.com|youtu\.be|tiktok\.com|vimeo\.com|\.(?:mp4|webm|mov)(?:\?|$))/i }
    ] }];
  }
  const posts = await populatePost(Post.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit || 30), 100)));
  res.json(posts);
}));


router.get('/user/:userId', asyncHandler(async (req, res) => {
  const isSelf = String(req.params.userId) === String(req.user._id);
  const isFriend = req.user.friends.some((id) => String(id) === String(req.params.userId));
  const visibility = [{ privacy: 'public' }];
  if (isFriend) visibility.push({ privacy: 'friends' }, { privacy: 'except', excludedUsers: { $ne: req.user._id } });
  if (isSelf) visibility.push({ author: req.user._id });
  const posts = await populatePost(Post.find({
    author: req.params.userId,
    isDeleted: false,
    ...(isSelf ? {} : { $or: visibility })
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit || 30), 100)));
  res.json(posts);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const post = await populatePost(Post.findById(req.params.id));
  if (!post || !(await canView(post, req.user))) return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
  res.json(post);
}));

router.post('/', asyncHandler(async (req, res) => {
  let group = null;
  if (req.body.groupId) {
    group = await CommunityGroup.findById(req.body.groupId);
    if (!group || !group.isActive) return res.status(404).json({ message: 'Không tìm thấy nhóm.' });
    const isMember = group.members.some((id) => String(id) === String(req.user._id));
    if (!isMember) return res.status(403).json({ message: 'Chỉ thành viên mới được đăng bài trong nhóm.' });
  }
  const post = await Post.create({
    author: req.user._id,
    text: req.body.text || '',
    media: req.body.media || [],
    location: req.body.location || undefined,
    privacy: group ? 'group' : (req.body.privacy || 'friends'),
    group: group?._id || null,
    excludedUsers: req.body.excludedUsers || [],
    contentType: req.body.contentType || ((req.body.media || []).some((item) => item.type === 'video') ? 'video' : 'post')
  });
  const populated = await populatePost(Post.findById(post._id));
  res.status(201).json(populated);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, author: req.user._id, isDeleted: false });
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
  for (const key of ['text', 'media', 'location', 'privacy', 'excludedUsers', 'contentType']) if (req.body[key] !== undefined) post[key] = req.body[key];
  await post.save();
  res.json(post);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, author: req.user._id });
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
  post.isDeleted = true;
  await post.save();
  res.json({ message: 'Đã xóa bài viết.' });
}));

router.post('/:id/repost', asyncHandler(async (req, res) => {
  const original = await Post.findById(req.params.id);
  if (!original || !(await canView(original, req.user))) return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
  const sourceId = original.repostOf || original._id;
  const source = original.repostOf ? await Post.findById(sourceId) : original;
  if (!source || source.isDeleted) return res.status(404).json({ message: 'Bài viết gốc không còn tồn tại.' });

  const repost = await Post.create({
    author: req.user._id,
    repostOf: sourceId,
    text: String(req.body.text || '').trim(),
    privacy: req.body.privacy || 'friends',
    contentType: source.contentType || (source.media?.some((item) => item.type === 'video') ? 'video' : 'post')
  });
  await Post.updateOne({ _id: sourceId }, { $inc: { shareCount: 1 } });
  const populated = await populatePost(Post.findById(repost._id));
  res.status(201).json(populated);
}));

router.post('/:id/share', asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post || !(await canView(post, req.user))) return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
  post.shareCount = (post.shareCount || 0) + 1;
  await post.save();
  res.json({ shareCount: post.shareCount, type: req.body.type || 'link' });
}));

router.post('/:id/like', asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post || post.isDeleted) return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
  const liked = post.likes.some((id) => String(id) === String(req.user._id));
  liked ? post.likes.pull(req.user._id) : post.likes.addToSet(req.user._id);
  await post.save();
  if (!liked && String(post.author) !== String(req.user._id)) {
    await createNotification(req.app.get('io'), {
      recipient: post.author,
      actor: req.user._id,
      type: 'post_like',
      title: 'Lượt thích mới',
      body: `${req.user.displayName} đã thích bài viết của bạn.`,
      data: { postId: post._id }
    });
  }
  res.json({ liked: !liked, count: post.likes.length });
}));

router.post('/:id/comments', asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post || !(await canView(post, req.user))) return res.status(404).json({ message: 'Không tìm thấy bài viết.' });

  const text = String(req.body.text || '').trim();
  const kind = ['text', 'sticker', 'image', 'audio'].includes(req.body.kind) ? req.body.kind : 'text';
  const media = Array.isArray(req.body.media)
    ? req.body.media.filter((item) => item?.url).slice(0, 1).map((item) => ({
      url: item.url,
      thumbUrl: item.thumbUrl || '',
      name: item.name || '',
      mimeType: item.mimeType || '',
      size: Number(item.size || 0),
      duration: Number(item.duration || 0)
    }))
    : [];
  const parentCommentId = req.body.parentCommentId || null;
  const parent = parentCommentId ? post.comments.id(parentCommentId) : null;
  if (parentCommentId && !parent) return res.status(404).json({ message: 'Bình luận bạn muốn trả lời không còn tồn tại.' });
  if (!text && media.length === 0) return res.status(400).json({ message: 'Bình luận cần có nội dung, sticker, ảnh hoặc âm thanh.' });

  const recipientId = parent?.user || post.author;
  post.comments.push({
    user: req.user._id,
    parentComment: parent?._id || null,
    kind,
    text,
    media
  });
  await post.save();
  const commentId = post.comments.at(-1)._id;
  await post.populate('comments.user', authorFields);
  const comment = post.comments.id(commentId);

  if (String(recipientId) !== String(req.user._id)) {
    const action = parent ? 'đã trả lời bình luận của bạn' : 'đã bình luận bài viết của bạn';
    await createNotification(req.app.get('io'), {
      recipient: recipientId,
      actor: req.user._id,
      type: parent ? 'comment_reply' : 'post_comment',
      title: parent ? 'Phản hồi bình luận mới' : 'Bình luận mới',
      body: `${req.user.displayName} ${action}.`,
      data: { postId: post._id, commentId: comment._id }
    });
  }

  // Chỉ phát ID bài viết. Client đang có quyền xem sẽ gọi lại API /posts/:id,
  // nhờ vậy comment/reply cập nhật realtime mà không làm lộ nội dung nhóm kín.
  req.app.get('io').emit('post:comment:changed', {
    postId: String(post._id),
    commentId: String(comment._id),
    actorId: String(req.user._id),
    at: new Date().toISOString()
  });
  res.status(201).json(comment);
}));

export default router;
