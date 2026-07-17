import express from 'express';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ensureMember } from '../services/messageService.js';
import { createLinkedCommunityGroup, syncConversationMembersToGroup } from '../services/communityGroups.js';

const router = express.Router();
router.use(requireAuth);
const userFields = 'displayName avatar accountType verified lastOnlineAt';

function directKey(a, b) {
  return [String(a), String(b)].sort().join(':');
}

router.get('/', asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ 'members.user': req.user._id })
    .sort({ lastMessageAt: -1 })
    .populate('members.user', userFields)
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'displayName avatar' }
    })
    .populate('pinnedMessages')
    .populate('communityGroup', 'name privacy avatar description');
  res.json(conversations);
}));

router.post('/direct', asyncHandler(async (req, res) => {
  const target = await User.findById(req.body.userId);
  if (!target) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
  if (req.user.blockedUsers.some((id) => String(id) === String(target._id)) || target.blockedUsers.some((id) => String(id) === String(req.user._id))) {
    return res.status(403).json({ message: 'Không thể tạo trò chuyện do danh sách chặn.' });
  }
  const isFriend = req.user.friends.some((id) => String(id) === String(target._id));
  if (target.accountType !== 'official' && !isFriend && target.settings?.allowMessagesFromStrangers === false) {
    return res.status(403).json({ message: 'Người này không nhận tin nhắn từ người lạ.' });
  }

  const type = target.accountType === 'official' ? 'official' : 'direct';
  const key = directKey(req.user._id, target._id);
  let conversation = await Conversation.findOne({ directKey: key });
  if (!conversation) {
    conversation = await Conversation.create({
      type,
      directKey: key,
      members: [
        { user: req.user._id, role: 'member' },
        { user: target._id, role: type === 'official' ? 'owner' : 'member' }
      ],
      createdBy: req.user._id,
      officialAccount: type === 'official' ? target._id : undefined
    });
  }
  await conversation.populate('members.user', userFields);
  res.status(201).json(conversation);
}));

router.post('/group', asyncHandler(async (req, res) => {
  const ids = [...new Set([req.user._id.toString(), ...(req.body.memberIds || [])])];
  if (ids.length < 2) return res.status(400).json({ message: 'Nhóm cần ít nhất 2 thành viên.' });
  const count = await User.countDocuments({ _id: { $in: ids }, isActive: true });
  if (count !== ids.length) return res.status(400).json({ message: 'Danh sách thành viên có tài khoản không hợp lệ.' });

  const { conversation, group } = await createLinkedCommunityGroup({
    ownerId: req.user._id,
    name: req.body.name || 'Nhóm mới',
    avatar: req.body.avatar || '',
    description: req.body.description || '',
    privacy: req.body.privacy || 'private',
    memberIds: ids.filter((id) => String(id) !== String(req.user._id))
  });
  await conversation.populate('members.user', userFields);
  conversation.communityGroup = group._id;
  const io = req.app.get('io');
  for (const member of conversation.members) {
    const memberId = member.user?._id || member.user;
    io.to(`user:${memberId}`).emit('conversation:created', conversation);
    io.to(`user:${memberId}`).emit('group:joined', { groupId: group._id, conversationId: conversation._id });
  }
  res.status(201).json(conversation);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const conversation = await ensureMember(req.params.id, req.user._id);
  const me = conversation.members.find((m) => String(m.user) === String(req.user._id));
  if (conversation.type !== 'group' || !['owner', 'admin'].includes(me.role)) return res.status(403).json({ message: 'Không có quyền sửa nhóm.' });
  for (const key of ['name', 'avatar', 'description']) if (req.body[key] !== undefined) conversation[key] = req.body[key];
  await conversation.save();
  await syncConversationMembersToGroup(conversation);
  req.app.get('io').to(`conversation:${conversation._id}`).emit('conversation:updated', conversation);
  res.json(conversation);
}));

router.post('/:id/members', asyncHandler(async (req, res) => {
  const conversation = await ensureMember(req.params.id, req.user._id);
  const me = conversation.members.find((m) => String(m.user) === String(req.user._id));
  if (conversation.type !== 'group' || !['owner', 'admin'].includes(me.role)) return res.status(403).json({ message: 'Không có quyền thêm thành viên.' });
  for (const userId of req.body.userIds || []) {
    if (!conversation.members.some((m) => String(m.user) === String(userId))) conversation.members.push({ user: userId, role: 'member' });
  }
  await conversation.save();
  await syncConversationMembersToGroup(conversation);
  await conversation.populate('members.user', userFields);
  req.app.get('io').to(`conversation:${conversation._id}`).emit('conversation:updated', conversation);
  res.json(conversation);
}));

router.delete('/:id/members/:userId', asyncHandler(async (req, res) => {
  const conversation = await ensureMember(req.params.id, req.user._id);
  const me = conversation.members.find((m) => String(m.user) === String(req.user._id));
  const target = conversation.members.find((m) => String(m.user) === String(req.params.userId));
  const leaving = String(req.user._id) === String(req.params.userId);
  if (!leaving && !['owner', 'admin'].includes(me.role)) return res.status(403).json({ message: 'Không có quyền xóa thành viên.' });
  if (target?.role === 'owner' && !leaving) return res.status(400).json({ message: 'Không thể xóa chủ nhóm.' });
  conversation.members = conversation.members.filter((m) => String(m.user) !== String(req.params.userId));
  await conversation.save();
  await syncConversationMembersToGroup(conversation);
  req.app.get('io').to(`conversation:${conversation._id}`).emit('conversation:updated', conversation);
  res.json({ message: leaving ? 'Đã rời nhóm.' : 'Đã xóa thành viên.' });
}));

router.patch('/:id/members/:userId/role', asyncHandler(async (req, res) => {
  const conversation = await ensureMember(req.params.id, req.user._id);
  const me = conversation.members.find((m) => String(m.user) === String(req.user._id));
  if (me.role !== 'owner') return res.status(403).json({ message: 'Chỉ chủ nhóm được phân quyền.' });
  const target = conversation.members.find((m) => String(m.user) === String(req.params.userId));
  if (!target) return res.status(404).json({ message: 'Không tìm thấy thành viên.' });
  if (!['admin', 'member'].includes(req.body.role)) return res.status(400).json({ message: 'Vai trò không hợp lệ.' });
  target.role = req.body.role;
  await conversation.save();
  await syncConversationMembersToGroup(conversation);
  res.json(conversation);
}));

router.post('/:id/pin/:messageId', asyncHandler(async (req, res) => {
  const conversation = await ensureMember(req.params.id, req.user._id);
  conversation.pinnedMessages.addToSet(req.params.messageId);
  await conversation.save();
  req.app.get('io').to(`conversation:${conversation._id}`).emit('message:pinned', { conversationId: conversation._id, messageId: req.params.messageId });
  res.json(conversation.pinnedMessages);
}));

router.delete('/:id/pin/:messageId', asyncHandler(async (req, res) => {
  const conversation = await ensureMember(req.params.id, req.user._id);
  conversation.pinnedMessages.pull(req.params.messageId);
  await conversation.save();
  res.json(conversation.pinnedMessages);
}));

export default router;

