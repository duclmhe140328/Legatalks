import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { handleOfficialAutomation } from './automation.js';
import { createNotification } from './notifications.js';

export async function ensureMember(conversationId, userId) {
  const conversation = await Conversation.findOne({ _id: conversationId, 'members.user': userId });
  if (!conversation) {
    const error = new Error('Bạn không thuộc cuộc trò chuyện này.');
    error.status = 403;
    throw error;
  }
  return conversation;
}

function messagePreview(payload) {
  if (payload.kind === 'image') return 'Đã gửi một ảnh';
  if (payload.kind === 'video') return 'Đã gửi một video';
  if (payload.kind === 'audio') return 'Đã gửi một tin nhắn thoại';
  if (payload.kind === 'file') return 'Đã gửi một tệp';
  if (payload.kind === 'sticker') return 'Đã gửi một sticker';
  if (payload.kind === 'gif') return 'Đã gửi một GIF';
  return String(payload.text || 'Tin nhắn mới').slice(0, 160);
}

const ALLOWED_MESSAGE_KINDS = new Set([
  'text', 'image', 'video', 'file', 'audio', 'sticker', 'gif', 'system'
]);

function normalizedMedia(payload = {}) {
  const raw = Array.isArray(payload.media)
    ? payload.media
    : Array.isArray(payload.attachments)
      ? payload.attachments
      : Array.isArray(payload.files)
        ? payload.files
        : [];

  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      url: item.url || item.fileUrl || item.path || '',
      mimeType: item.mimeType || item.mimetype || '',
      name: item.name || item.fileName || ''
    }))
    .filter((item) => item.url);
}

function normalizedMessageKind(payload = {}, media = []) {
  const requested = String(
    payload.kind ||
    payload.messageType ||
    payload.contentType ||
    payload.type ||
    ''
  ).trim().toLowerCase();

  if (ALLOWED_MESSAGE_KINDS.has(requested)) return requested;
  if (!media.length) return 'text';

  const kinds = new Set(media.map((item) => {
    const type = String(item.type || item.kind || item.mimeType || '').toLowerCase();
    const name = String(item.name || item.url || '').toLowerCase();

    if (type.includes('image') || /\.(png|jpe?g|gif|webp)$/i.test(name)) return 'image';
    if (type.includes('video') || /\.(mp4|mov|webm|mkv|avi)$/i.test(name)) return 'video';
    if (type.includes('audio') || /\.(mp3|m4a|wav|aac|ogg|opus|flac)$/i.test(name)) return 'audio';
    return 'file';
  }));

  return kinds.size === 1 ? [...kinds][0] : 'file';
}

async function enforceDirectPrivacy(conversation, senderId) {
  if (conversation.type !== 'direct') return;
  const targetId = conversation.members.map((member) => member.user).find((id) => String(id) !== String(senderId));
  if (!targetId) return;
  const [sender, target] = await Promise.all([
    User.findById(senderId).select('friends blockedUsers'),
    User.findById(targetId).select('settings friends blockedUsers isActive')
  ]);
  if (!target?.isActive) throw Object.assign(new Error('Tài khoản người nhận không hoạt động.'), { status: 403 });
  if (sender?.blockedUsers.some((id) => String(id) === String(targetId)) || target.blockedUsers.some((id) => String(id) === String(senderId))) {
    throw Object.assign(new Error('Không thể gửi tin nhắn do danh sách chặn.'), { status: 403 });
  }
  const isFriend = sender?.friends.some((id) => String(id) === String(targetId));
  if (!isFriend && target.settings?.allowMessagesFromStrangers === false) {
    throw Object.assign(new Error('Người này không nhận tin nhắn từ người lạ.'), { status: 403 });
  }
}

export async function createMessage({ io, userId, payload }) {
  const conversationId = payload.conversationId || payload.conversation;
  const conversation = await ensureMember(conversationId, userId);
  await enforceDirectPrivacy(conversation, userId);

  const media = normalizedMedia(payload);
  const kind = normalizedMessageKind(payload, media);
  const memberIds = conversation.members.map((member) => member.user);
  const messageDoc = {
    conversation: conversation._id,
    sender: userId,
    kind,
    text: payload.text || payload.body || payload.content || payload.message || '',
    media,
    replyTo: payload.replyTo || null,
    metadata: payload.metadata || {},
    receipts: memberIds.filter((id) => String(id) !== String(userId)).map((id) => ({ user: id }))
  };

  // Chỉ ghi các field unique khi thật sự có giá trị. Nếu set null/undefined vào unique sparse index,
  // MongoDB có thể xem đó là một giá trị trùng và báo E11000 khi tạo nhiều system message.
  if (payload.clientId) messageDoc.clientId = payload.clientId;
  if (payload.eventKey) messageDoc.eventKey = payload.eventKey;
  if (payload.callSession) messageDoc.callSession = payload.callSession;

  let message;
  try {
    message = await Message.create(messageDoc);
  } catch (error) {
    // Mobile/Socket có thể retry một request đã ghi thành công. Với unique key,
    // trả lại message cũ thay vì báo "Dữ liệu đã tồn tại" làm client tưởng gửi lỗi.
    if (error?.code === 11000) {
      if (payload.eventKey) message = await Message.findOne({ eventKey: payload.eventKey });
      if (!message && payload.clientId) message = await Message.findOne({ clientId: payload.clientId, sender: userId });
      if (!message && payload.callSession) message = await Message.findOne({ callSession: payload.callSession });
      if (!message) {
        const key = error.keyValue || {};
        if (key.eventKey) message = await Message.findOne({ eventKey: key.eventKey });
        if (!message && key.clientId) message = await Message.findOne({ clientId: key.clientId, sender: userId });
        if (!message && key.callSession) message = await Message.findOne({ callSession: key.callSession });
      }
      if (!message) throw error;
    } else {
      throw error;
    }
  }

  conversation.lastMessage = message._id;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  const populated = await Message.findById(message._id)
    .populate('sender', 'displayName avatar accountType verified')
    .populate({ path: 'replyTo', populate: { path: 'sender', select: 'displayName' } });

  io.to(`conversation:${conversation._id}`).emit('message:new', populated);

  const recipients = memberIds.filter((id) => String(id) !== String(userId));
  await Promise.all(recipients.map((recipient) => createNotification(io, {
    recipient,
    actor: userId,
    type: 'message',
    title: populated.sender?.displayName || 'Tin nhắn mới',
    body: messagePreview({ ...payload, kind, media }),
    data: { conversationId: conversation._id, messageId: message._id, kind: message.kind }
  })));

  await handleOfficialAutomation({ io, conversation, message, senderId: userId });
  return populated;
}
