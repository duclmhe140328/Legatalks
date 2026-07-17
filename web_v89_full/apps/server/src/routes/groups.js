import express from 'express';
import CommunityGroup from '../models/CommunityGroup.js';
import Conversation from '../models/Conversation.js';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createLinkedCommunityGroup, groupUserFields } from '../services/communityGroups.js';
import { createNotification } from '../services/notifications.js';

const router = express.Router();
router.use(requireAuth);
const authorFields = 'displayName avatar accountType verified';

const populateGroup = (query) => query
  .populate('owner', groupUserFields)
  .populate('admins', groupUserFields)
  .populate('members', groupUserFields)
  .populate('pendingRequests.user', groupUserFields)
  .populate('conversation', 'name avatar description type members');

const populatePosts = (query) => query
  .populate('author', authorFields)
  .populate('comments.user', authorFields)
  .populate({
    path: 'repostOf',
    populate: [
      { path: 'author', select: authorFields },
      { path: 'comments.user', select: authorFields }
    ]
  });

function memberOf(group, userId) {
  return group.members.some((member) => String(member?._id || member) === String(userId));
}

function managerOf(group, userId) {
  return String(group.owner?._id || group.owner) === String(userId)
    || group.admins.some((admin) => String(admin?._id || admin) === String(userId));
}

function serializeGroup(group, userId) {
  const isMember = memberOf(group, userId);
  const isManager = managerOf(group, userId);
  const hasPendingRequest = group.pendingRequests.some((item) => String(item.user?._id || item.user) === String(userId));
  const value = group.toObject();
  if (group.privacy === 'private' && !isMember && !isManager) {
    delete value.members;
    delete value.admins;
    delete value.pendingRequests;
    delete value.conversation;
  }
  return {
    ...value,
    membersCount: group.members.length,
    isMember,
    isManager,
    hasPendingRequest
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const query = {
    isActive: true,
    ...(search ? { $text: { $search: search } } : {})
  };
  const groups = await populateGroup(CommunityGroup.find(query).sort({ updatedAt: -1 }).limit(100));
  res.json(groups.map((group) => serializeGroup(group, req.user._id)));
}));

router.post('/', asyncHandler(async (req, res) => {
  const ids = [...new Set((req.body.memberIds || []).map(String))];
  const { group } = await createLinkedCommunityGroup({
    ownerId: req.user._id,
    name: String(req.body.name || '').trim() || 'Nhóm mới',
    description: String(req.body.description || '').trim(),
    avatar: req.body.avatar || '',
    cover: req.body.cover || '',
    privacy: req.body.privacy,
    memberIds: ids
  });
  const io = req.app.get('io');
  for (const member of group.members) {
    const memberId = member?._id || member;
    io.to(`user:${memberId}`).emit('group:joined', { groupId: group._id, conversationId: group.conversation?._id || group.conversation });
    io.to(`user:${memberId}`).emit('conversation:created', group.conversation);
  }
  res.status(201).json(serializeGroup(group, req.user._id));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const group = await populateGroup(CommunityGroup.findById(req.params.id));
  if (!group || !group.isActive) return res.status(404).json({ message: 'Không tìm thấy nhóm.' });
  const isMember = memberOf(group, req.user._id);
  if (group.privacy === 'private' && !isMember && !managerOf(group, req.user._id)) {
    return res.json({
      _id: group._id,
      name: group.name,
      avatar: group.avatar,
      cover: group.cover,
      description: group.description,
      privacy: group.privacy,
      owner: group.owner,
      membersCount: group.members.length,
      isMember: false,
      isManager: false,
      hasPendingRequest: group.pendingRequests.some((item) => String(item.user?._id || item.user) === String(req.user._id))
    });
  }
  res.json(serializeGroup(group, req.user._id));
}));

router.get('/:id/posts', asyncHandler(async (req, res) => {
  const group = await CommunityGroup.findById(req.params.id);
  if (!group || !group.isActive) return res.status(404).json({ message: 'Không tìm thấy nhóm.' });
  const isMember = memberOf(group, req.user._id);
  if (group.privacy === 'private' && !isMember) return res.status(403).json({ message: 'Chỉ thành viên mới xem được bài viết của nhóm kín.' });
  const posts = await populatePosts(Post.find({ group: group._id, isDeleted: false }).sort({ createdAt: -1 }).limit(100));
  res.json(posts);
}));

router.post('/:id/join', asyncHandler(async (req, res) => {
  const group = await CommunityGroup.findById(req.params.id);
  if (!group || !group.isActive) return res.status(404).json({ message: 'Không tìm thấy nhóm.' });
  if (memberOf(group, req.user._id)) return res.json({ status: 'member', message: 'Bạn đã là thành viên.' });

  if (group.privacy === 'private') {
    if (!group.pendingRequests.some((item) => String(item.user) === String(req.user._id))) {
      group.pendingRequests.push({ user: req.user._id });
      await group.save();
      await createNotification(req.app.get('io'), {
        recipient: group.owner,
        actor: req.user._id,
        type: 'group_join_request',
        title: 'Yêu cầu tham gia nhóm',
        body: `${req.user.displayName} muốn tham gia nhóm ${group.name}.`,
        data: { groupId: group._id }
      });
    }
    return res.json({ status: 'pending', message: 'Đã gửi yêu cầu. Trưởng nhóm sẽ duyệt.' });
  }

  group.members.addToSet(req.user._id);
  await group.save();
  const conversation = await Conversation.findById(group.conversation);
  if (conversation && !conversation.members.some((member) => String(member.user) === String(req.user._id))) {
    conversation.members.push({ user: req.user._id, role: 'member' });
    await conversation.save();
  }
  const io = req.app.get('io');
  io.to(`user:${req.user._id}`).emit('group:joined', { groupId: group._id, conversationId: group.conversation });
  if (conversation) {
    await conversation.populate('members.user', groupUserFields);
    io.to(`user:${req.user._id}`).emit('conversation:created', conversation);
    io.to(`conversation:${conversation._id}`).emit('conversation:updated', conversation);
  }
  res.json({ status: 'member', message: 'Đã tham gia nhóm.' });
}));

router.post('/:id/requests/:userId/approve', asyncHandler(async (req, res) => {
  const group = await CommunityGroup.findById(req.params.id);
  if (!group || !group.isActive) return res.status(404).json({ message: 'Không tìm thấy nhóm.' });
  if (!managerOf(group, req.user._id)) return res.status(403).json({ message: 'Bạn không có quyền duyệt thành viên.' });
  const requested = group.pendingRequests.some((item) => String(item.user) === String(req.params.userId));
  if (!requested) return res.status(404).json({ message: 'Không tìm thấy yêu cầu tham gia.' });

  group.pendingRequests = group.pendingRequests.filter((item) => String(item.user) !== String(req.params.userId));
  group.members.addToSet(req.params.userId);
  await group.save();

  const conversation = await Conversation.findById(group.conversation);
  if (conversation && !conversation.members.some((member) => String(member.user) === String(req.params.userId))) {
    conversation.members.push({ user: req.params.userId, role: 'member' });
    await conversation.save();
    req.app.get('io').to(`conversation:${conversation._id}`).emit('conversation:updated', conversation);
  }

  await createNotification(req.app.get('io'), {
    recipient: req.params.userId,
    actor: req.user._id,
    type: 'group_join_approved',
    title: 'Đã được duyệt vào nhóm',
    body: `Bạn đã được duyệt vào nhóm ${group.name}.`,
    data: { groupId: group._id, conversationId: group.conversation }
  });
  req.app.get('io').to(`user:${req.params.userId}`).emit('group:joined', { groupId: group._id, conversationId: group.conversation });
  if (conversation) req.app.get('io').to(`user:${req.params.userId}`).emit('conversation:created', conversation);
  res.json({ message: 'Đã duyệt thành viên.' });
}));

router.delete('/:id/requests/:userId', asyncHandler(async (req, res) => {
  const group = await CommunityGroup.findById(req.params.id);
  if (!group || !group.isActive) return res.status(404).json({ message: 'Không tìm thấy nhóm.' });
  if (!managerOf(group, req.user._id)) return res.status(403).json({ message: 'Bạn không có quyền từ chối yêu cầu.' });
  group.pendingRequests = group.pendingRequests.filter((item) => String(item.user) !== String(req.params.userId));
  await group.save();
  res.json({ message: 'Đã từ chối yêu cầu.' });
}));

router.post('/:id/members', asyncHandler(async (req, res) => {
  const group = await CommunityGroup.findById(req.params.id);
  if (!group || !group.isActive) return res.status(404).json({ message: 'Không tìm thấy nhóm.' });
  if (!managerOf(group, req.user._id)) return res.status(403).json({ message: 'Bạn không có quyền thêm thành viên.' });
  const ids = [...new Set((req.body.userIds || []).map(String))];
  const valid = await User.find({ _id: { $in: ids }, isActive: true }).select('_id');
  const conversation = await Conversation.findById(group.conversation);
  for (const item of valid) {
    group.members.addToSet(item._id);
    if (conversation && !conversation.members.some((member) => String(member.user) === String(item._id))) {
      conversation.members.push({ user: item._id, role: 'member' });
    }
  }
  await group.save();
  if (conversation) await conversation.save();
  const io = req.app.get('io');
  for (const item of valid) {
    io.to(`user:${item._id}`).emit('group:joined', { groupId: group._id, conversationId: group.conversation });
    if (conversation) io.to(`user:${item._id}`).emit('conversation:created', conversation);
  }
  res.json({ message: 'Đã thêm thành viên.' });
}));

export default router;
