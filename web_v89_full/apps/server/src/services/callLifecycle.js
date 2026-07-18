import CallSession from '../models/CallSession.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { createNotification } from './notifications.js';
import { cancelIncomingCallPush } from './incomingCalls.js';

export const TERMINAL_CALL_STATUSES = ['ended', 'missed', 'declined', 'busy'];
export const ACTIVE_CALL_STATUSES = ['ringing', 'active'];
export const RINGING_TTL_MS = 60_000;

const callRoom = (callSessionId) => `call:${callSessionId}`;
const callSessionRoom = (callSessionId) => `call-session:${callSessionId}`;

function objectId(value) {
  return value?._id || value || null;
}

function durationSeconds(session) {
  if (!session.answeredAt || !session.endedAt) return 0;
  return Math.max(0, Math.round((new Date(session.endedAt) - new Date(session.answeredAt)) / 1000));
}

function formatDuration(totalSeconds) {
  if (!totalSeconds) return '';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours} giờ ${minutes} phút`;
  if (minutes) return `${minutes} phút ${seconds} giây`;
  return `${seconds} giây`;
}

export function callStatusText(session) {
  const mode = session.mode === 'video' ? 'video' : 'thoại';
  const seconds = durationSeconds(session);
  if (session.status === 'missed') return `Cuộc gọi ${mode} nhỡ`;
  if (session.status === 'declined') return `Cuộc gọi ${mode} đã bị từ chối`;
  if (session.status === 'busy') return `Cuộc gọi ${mode} không thành công · Người nhận đang bận`;
  if (session.status === 'ended') return `Cuộc gọi ${mode} đã kết thúc${seconds ? ` · ${formatDuration(seconds)}` : ''}`;
  return `Cuộc gọi ${mode}`;
}

/**
 * Payload hiển thị cuộc gọi trong chat được dựng trực tiếp từ CallSession.
 * Nhờ đó chat không phụ thuộc vào việc document Message cũ có ghi thành công hay không.
 */
export function buildCallChatEvent(session, endedBy = null) {
  const occurredAt = session.endedAt || session.updatedAt || session.startedAt || session.createdAt || new Date();
  return {
    _id: `call-event-${session._id}`,
    callSession: session._id,
    conversation: String(objectId(session.conversation)),
    sender: session.startedBy,
    kind: 'system',
    text: callStatusText(session),
    metadata: {
      type: 'call',
      callSessionId: session._id,
      conversationId: objectId(session.conversation),
      mode: session.mode,
      status: session.status,
      startedAt: session.startedAt,
      answeredAt: session.answeredAt,
      endedAt: session.endedAt,
      durationSeconds: durationSeconds(session),
      startedBy: objectId(session.startedBy),
      endedBy: endedBy || objectId(session.endedBy)
    },
    receipts: [],
    createdAt: occurredAt,
    updatedAt: occurredAt,
    virtualCallEvent: true
  };
}

function callMessageData(session, conversation, endedBy) {
  const memberIds = conversation.members.map((member) => objectId(member.user));
  return {
    eventKey: `call:${session._id}:terminal`,
    callSession: session._id,
    conversation: conversation._id,
    sender: objectId(session.startedBy),
    kind: 'system',
    text: callStatusText(session),
    metadata: buildCallChatEvent(session, endedBy).metadata,
    receipts: memberIds
      .filter((id) => String(id) !== String(objectId(session.startedBy)))
      .map((id) => ({ user: id }))
  };
}

/**
 * Lưu bản sao Message để conversation preview/search tiếp tục hoạt động.
 * Chat vẫn có fallback CallSession nên lỗi index/dữ liệu cũ không làm mất thẻ cuộc gọi.
 */
export async function createCallMessage(io, session, endedBy, { emit = true } = {}) {
  const conversation = await Conversation.findById(objectId(session.conversation));
  if (!conversation) return null;

  const eventKey = `call:${session._id}:terminal`;
  const data = callMessageData(session, conversation, endedBy);
  const occurredAt = session.endedAt || session.updatedAt || new Date();

  let message = await Message.findOne({ $or: [{ callSession: session._id }, { eventKey }] });
  if (!message) {
    try {
      message = await Message.create({ ...data, createdAt: occurredAt, updatedAt: occurredAt });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      message = await Message.findOne({ $or: [{ callSession: session._id }, { eventKey }] });
    }
  }

  if (!message) return null;
  message.callSession ||= session._id;
  message.eventKey ||= eventKey;
  message.text = data.text;
  message.metadata = data.metadata;
  await message.save();

  if (!conversation.lastMessageAt || new Date(message.createdAt) >= new Date(conversation.lastMessageAt)) {
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;
    await conversation.save();
  }

  const populated = await Message.findById(message._id)
    .populate('sender', 'displayName avatar accountType verified');
  if (emit) io?.to(`conversation:${conversation._id}`).emit('message:new', populated);
  return populated;
}

export async function getCallChatEvents(conversationId) {
  const sessions = await CallSession.find({
    conversation: conversationId,
    status: { $in: TERMINAL_CALL_STATUSES }
  })
    .sort({ startedAt: 1, _id: 1 })
    .populate('startedBy', 'displayName avatar accountType verified');
  return sessions.map((session) => buildCallChatEvent(session));
}

/** Backfill Message lưu trữ; lỗi một bản ghi không chặn các bản ghi còn lại. */
export async function ensureCallMessagesForConversation({ io, conversationId }) {
  const sessions = await CallSession.find({
    conversation: conversationId,
    status: { $in: TERMINAL_CALL_STATUSES }
  }).sort({ startedAt: 1, _id: 1 });

  for (const session of sessions) {
    try {
      await createCallMessage(io, session, null, { emit: false });
    } catch (error) {
      console.error(`Call message backfill failed for ${session._id}:`, error.message);
    }
  }
  return sessions.length;
}

async function createTerminalNotifications(io, session) {
  if (session.status === 'missed') {
    await Promise.all(session.invitees.map((recipient) => createNotification(io, {
      recipient,
      actor: objectId(session.startedBy),
      type: 'missed_call',
      title: session.mode === 'video' ? 'Cuộc gọi video nhỡ' : 'Cuộc gọi thoại nhỡ',
      body: callStatusText(session),
      data: {
        callSessionId: session._id,
        conversationId: objectId(session.conversation),
        mode: session.mode,
        status: session.status
      }
    })));
  }

  if (session.status === 'declined') {
    await createNotification(io, {
      recipient: objectId(session.startedBy),
      actor: session.invitees[0],
      type: 'call_declined',
      title: 'Cuộc gọi bị từ chối',
      body: callStatusText(session),
      data: {
        callSessionId: session._id,
        conversationId: objectId(session.conversation),
        mode: session.mode,
        status: session.status
      }
    });
  }
}

export async function finalizeCall({ io, session: inputSession, status, endedBy = null }) {
  let session = inputSession?._id
    ? await CallSession.findById(inputSession._id)
    : await CallSession.findById(inputSession);
  if (!session) return null;

  const alreadyTerminal = TERMINAL_CALL_STATUSES.includes(session.status);
  if (!alreadyTerminal) {
    session.status = status || (session.status === 'ringing' ? 'missed' : 'ended');
    session.endedAt = new Date();
    session.endedBy = endedBy || session.endedBy || null;
    for (const participant of session.participants) {
      if (!participant.leftAt) participant.leftAt = session.endedAt;
    }
    await session.save();
  } else if (endedBy && !session.endedBy) {
    session.endedBy = endedBy;
    await session.save();
  }

  // Ghi Message chỉ là lớp lưu trữ phụ, không được phép làm hỏng finalize cuộc gọi.
  try {
    await createCallMessage(io, session, endedBy || session.endedBy, { emit: false });
  } catch (error) {
    console.error(`Create call chat message failed for ${session._id}:`, error.message);
  }

  if (!session.terminalNotifiedAt) {
    await createTerminalNotifications(io, session);
    session.terminalNotifiedAt = new Date();
    await session.save();
  }

  session = await CallSession.findById(session._id)
    .populate('startedBy', 'displayName avatar accountType verified');

  const payload = {
    callSessionId: session._id,
    conversationId: objectId(session.conversation),
    status: session.status,
    endedAt: session.endedAt,
    durationSeconds: durationSeconds(session),
    endedBy: objectId(session.endedBy) || endedBy || null
  };
  const userRooms = [
    `user:${objectId(session.startedBy)}`,
    ...session.invitees.map((invitee) => `user:${objectId(invitee)}`)
  ];
  const callRooms = [callRoom(session._id), callSessionRoom(session._id), ...userRooms];
  io?.to(callRooms).emit('call:ended', payload);
  io?.to(callRooms).emit('call:terminal', payload);

  cancelIncomingCallPush({ session, status: session.status })
    .catch((error) => console.error('Cancel incoming call push error:', error.message));

  // Luôn phát event chat riêng từ CallSession. Client đang mở chat nhận ngay;
  // client mở sau sẽ lấy lại cùng event qua GET /messages/:conversationId.
  const chatEvent = buildCallChatEvent(session, payload.endedBy);
  io?.to([`conversation:${objectId(session.conversation)}`, ...userRooms]).emit('call:chat-event', chatEvent);
  return session;
}

export async function expireStaleCalls(io) {
  const stale = await CallSession.find({
    status: 'ringing',
    $or: [
      { expiresAt: { $lte: new Date() } },
      { expiresAt: null, createdAt: { $lt: new Date(Date.now() - RINGING_TTL_MS) } }
    ]
  });
  await Promise.all(stale.map((session) => finalizeCall({ io, session, status: 'missed' })));
  return stale.length;
}
