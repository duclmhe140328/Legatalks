import CommunityGroup from '../models/CommunityGroup.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';

export const groupUserFields = 'displayName avatar accountType verified lastOnlineAt';

export async function createLinkedCommunityGroup({
  ownerId,
  name,
  description = '',
  avatar = '',
  cover = '',
  privacy = 'public',
  memberIds = [],
  conversation = null
}) {
  const ids = [...new Set([String(ownerId), ...memberIds.map(String)])];
  const validUsers = await User.find({ _id: { $in: ids }, isActive: true }).select('_id');
  const validIds = validUsers.map((item) => String(item._id));
  if (!validIds.includes(String(ownerId))) throw new Error('Chủ nhóm không hợp lệ.');

  let linkedConversation = conversation;
  if (!linkedConversation) {
    linkedConversation = await Conversation.create({
      type: 'group',
      name: name || 'Nhóm mới',
      avatar,
      description,
      members: validIds.map((id) => ({ user: id, role: id === String(ownerId) ? 'owner' : 'member' })),
      createdBy: ownerId
    });
  }

  let group = await CommunityGroup.findOne({ conversation: linkedConversation._id });
  if (!group) {
    group = await CommunityGroup.create({
      name: name || linkedConversation.name || 'Nhóm mới',
      description,
      avatar,
      cover,
      privacy: privacy === 'private' ? 'private' : 'public',
      owner: ownerId,
      admins: [],
      members: validIds,
      conversation: linkedConversation._id
    });
  }

  if (!linkedConversation.communityGroup) {
    linkedConversation.communityGroup = group._id;
    await linkedConversation.save();
  }

  await group.populate('owner members admins pendingRequests.user', groupUserFields);
  await group.populate('conversation', 'name avatar description type members');
  return { group, conversation: linkedConversation };
}

export async function syncConversationMembersToGroup(conversation) {
  if (!conversation?.communityGroup) return null;
  const group = await CommunityGroup.findById(conversation.communityGroup);
  if (!group) return null;
  group.members = conversation.members.map((member) => member.user?._id || member.user);
  const ownerMember = conversation.members.find((member) => member.role === 'owner');
  if (ownerMember) group.owner = ownerMember.user?._id || ownerMember.user;
  group.admins = conversation.members
    .filter((member) => member.role === 'admin')
    .map((member) => member.user?._id || member.user);
  group.name = conversation.name || group.name;
  group.avatar = conversation.avatar || group.avatar;
  group.description = conversation.description || group.description;
  await group.save();
  return group;
}

