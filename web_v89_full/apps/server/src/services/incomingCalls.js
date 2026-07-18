import CallSession from '../models/CallSession.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import { createNotification } from './notifications.js';
import { sendPushToUser } from './push.js';

function objectId(value) {
  return value?._id || value || null;
}

function callPath(callSessionId) {
  return `/chats?incomingCall=${encodeURIComponent(String(callSessionId))}`;
}

/**
 * Gửi một lần duy nhất event realtime + thông báo nền cho cuộc gọi mới.
 * HTTP POST /calls gọi hàm này ngay sau khi tạo session; socket call:invite
 * chỉ còn là lớp dự phòng và không thể tạo thông báo trùng.
 */
export async function dispatchIncomingCall({ io, callSessionId, caller = null }) {
  const session = await CallSession.findOneAndUpdate(
    { _id: callSessionId, status: 'ringing', inviteNotifiedAt: null },
    { $set: { inviteNotifiedAt: new Date() } },
    { new: true }
  );

  if (!session) return { ok: true, duplicate: true };

  try {
    const [conversation, callerDoc] = await Promise.all([
      Conversation.findById(session.conversation)
        .populate('members.user', 'displayName avatar accountType verified'),
      caller ? Promise.resolve(caller) : User.findById(session.startedBy)
        .select('displayName avatar accountType verified')
    ]);

    if (!conversation || !callerDoc) {
      throw new Error('Không tìm thấy dữ liệu cuộc gọi.');
    }

    const callerId = objectId(callerDoc);
    const payload = {
      conversationId: conversation._id,
      conversation,
      mode: session.mode,
      callSessionId: session._id,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      from: {
        id: callerId,
        _id: callerId,
        displayName: callerDoc.displayName || 'Người gọi',
        avatar: callerDoc.avatar || ''
      }
    };

    await Promise.all(session.invitees.map(async (invitee) => {
      io?.to(`user:${invitee}`).emit('call:incoming', payload);
      await createNotification(io, {
        recipient: invitee,
        actor: callerId,
        type: 'incoming_call',
        title: session.mode === 'video' ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến',
        body: `${callerDoc.displayName || 'Có người'} đang gọi cho bạn.`,
        data: {
          callSessionId: session._id,
          conversationId: conversation._id,
          mode: session.mode,
          startedAt: session.startedAt,
          expiresAt: session.expiresAt,
          callerName: callerDoc.displayName || 'Người gọi',
          callerAvatar: callerDoc.avatar || '',
          path: callPath(session._id)
        }
      });
    }));

    return { ok: true, duplicate: false, payload };
  } catch (error) {
    // Cho phép call:invite hoặc lần retry kế tiếp gửi lại nếu dispatch đầu tiên lỗi.
    await CallSession.updateOne(
      { _id: session._id, status: 'ringing' },
      { $unset: { inviteNotifiedAt: 1 } }
    ).catch(() => {});
    throw error;
  }
}

/** Gửi data push để các thiết bị/PWA đóng notification cuộc gọi đã hết hiệu lực. */
export async function cancelIncomingCallPush({ session, userIds = null, status = 'ended' }) {
  if (!session) return;
  const recipients = (userIds || session.invitees || [])
    .map(objectId)
    .filter(Boolean);
  if (!recipients.length) return;

  const payload = {
    type: 'call_terminal',
    title: '',
    body: '',
    data: {
      type: 'call_terminal',
      callSessionId: objectId(session),
      conversationId: objectId(session.conversation),
      mode: session.mode,
      status,
      path: callPath(objectId(session))
    }
  };

  await Promise.allSettled(recipients.map((recipient) => sendPushToUser(recipient, payload)));
}
