import mongoose from 'mongoose';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import CallSession from '../models/CallSession.js';
import Meeting from '../models/Meeting.js';
import LiveStream from '../models/LiveStream.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { createMessage } from '../services/messageService.js';
import { createNotification } from '../services/notifications.js';
import { expireStaleCalls, finalizeCall, TERMINAL_CALL_STATUSES } from '../services/callLifecycle.js';
import { cancelIncomingCallPush, dispatchIncomingCall } from '../services/incomingCalls.js';

const callRoom = (callSessionId) => `call:${callSessionId}`;
const callSessionRoom = (callSessionId) => `call-session:${callSessionId}`;
const liveRoom = (streamId) => `live:${streamId}`;
const meetingRtcRoom = (meetingId) => `meeting-rtc:${meetingId}`;

export function configureSockets(io) {
  const onlineCounts = new Map();
  const liveAudience = new Map();
  const callDisconnectTimers = new Map();

  const callDisconnectKey = (callSessionId, userId) =>
    `${String(callSessionId)}:${String(userId)}`;

  const clearCallDisconnectGrace = (callSessionId, userId) => {
    const key = callDisconnectKey(callSessionId, userId);
    const timer = callDisconnectTimers.get(key);
    if (timer) clearTimeout(timer);
    callDisconnectTimers.delete(key);
  };
  const staleCallTimer = setInterval(() => {
    expireStaleCalls(io).catch((error) => console.error('Expire stale calls error:', error.message));
  }, 10_000);
  staleCallTimer.unref?.();

  const onlineSnapshot = () => [...onlineCounts.entries()]
    .filter(([, count]) => count > 0)
    .map(([id]) => id);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub);
      const session = user?.sessions.id(payload.sid);
      if (!user || !session || session.revokedAt) throw new Error('Unauthorized');
      socket.user = user;
      socket.sessionId = payload.sid;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    socket.data.callSessionIds = new Set();
    socket.data.liveStreams = new Map();
    socket.data.meetingRtcIds = new Set();
    socket.join(`user:${userId}`);
    socket.user.lastOnlineAt = new Date();
    await socket.user.save();

    const previousCount = onlineCounts.get(userId) || 0;
    onlineCounts.set(userId, previousCount + 1);

    const conversations = await Conversation.find({ 'members.user': userId }).select('_id');
    for (const item of conversations) socket.join(`conversation:${item._id}`);

    socket.emit('presence:snapshot', { userIds: onlineSnapshot(), at: new Date() });
    if (previousCount === 0) io.emit('presence:update', { userId, online: true, at: new Date() });

    socket.on('presence:get', (ack) => ack?.({ ok: true, userIds: onlineSnapshot(), at: new Date() }));


    const updateLiveAudience = async (streamId, viewerUserId, delta) => {
      const id = String(streamId);
      if (!liveAudience.has(id)) liveAudience.set(id, new Map());
      const users = liveAudience.get(id);
      const next = Math.max(0, (users.get(String(viewerUserId)) || 0) + delta);
      if (next === 0) users.delete(String(viewerUserId)); else users.set(String(viewerUserId), next);
      if (users.size === 0) liveAudience.delete(id);
      const count = users.size;
      await LiveStream.updateOne({ _id: id }, { $set: { currentViewers: count }, $max: { peakViewers: count } });
      io.to(liveRoom(id)).emit('live:viewers', { streamId: id, count });
      return count;
    };

    const leaveLiveStream = async (streamId, { disconnecting = false } = {}) => {
      const id = String(streamId || '');
      if (!id || !socket.data.liveStreams.has(id)) return;
      const role = socket.data.liveStreams.get(id);
      socket.data.liveStreams.delete(id);
      if (role === 'viewer') {
        await updateLiveAudience(id, userId, -1);
        socket.to(liveRoom(id)).emit('live:viewer-left', { streamId: id, socketId: socket.id, userId });
      }
      if (!disconnecting) socket.leave(liveRoom(id));
    };

    socket.on('live:join', async ({ streamId }, ack) => {
      try {
        const stream = await LiveStream.findById(streamId).populate('host', 'displayName avatar friends');
        if (!stream || stream.status !== 'live') return ack?.({ ok: false, message: 'Livestream đã kết thúc hoặc không tồn tại.' });
        const hostId = String(stream.host?._id || stream.host);
        const isHost = hostId === userId;
        const allowed = isHost || stream.visibility === 'public' || socket.user.friends.some((id) => String(id) === hostId);
        if (!allowed) return ack?.({ ok: false, message: 'Livestream này chỉ dành cho bạn bè.' });

        const room = liveRoom(stream._id);
        socket.join(room);
        const previousRole = socket.data.liveStreams.get(String(stream._id));
        const role = isHost ? 'host' : 'viewer';
        socket.data.liveStreams.set(String(stream._id), role);
        if (role === 'viewer' && previousRole !== 'viewer') {
          await updateLiveAudience(stream._id, userId, 1);
          io.to(`user:${hostId}`).emit('live:viewer-joined', {
            streamId: String(stream._id),
            socketId: socket.id,
            user: { _id: userId, displayName: socket.user.displayName, avatar: socket.user.avatar }
          });
        }
        const count = liveAudience.get(String(stream._id))?.size || 0;
        ack?.({ ok: true, role, viewerCount: count, hostId });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('live:leave', async ({ streamId }, ack) => {
      try {
        await leaveLiveStream(streamId);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });

    const relayLiveSignal = (eventName, payload) => {
      const streamId = String(payload.streamId || '');
      const targetSocket = io.sockets.sockets.get(payload.target);
      if (!streamId || !targetSocket || !socket.rooms.has(liveRoom(streamId)) || !targetSocket.rooms.has(liveRoom(streamId))) return;
      io.to(payload.target).emit(eventName, {
        ...payload,
        from: socket.id,
        user: { _id: userId, displayName: socket.user.displayName, avatar: socket.user.avatar }
      });
    };
    socket.on('live:offer', (payload) => relayLiveSignal('live:offer', payload));
    socket.on('live:answer', (payload) => relayLiveSignal('live:answer', payload));
    socket.on('live:ice', (payload) => relayLiveSignal('live:ice', payload));

    socket.on('call:status:get', async ({ callSessionId }, ack) => {
      try {
        const session = await CallSession.findOne({
          _id: callSessionId,
          $or: [{ startedBy: userId }, { invitees: userId }, { 'participants.user': userId }]
        }).select('_id status conversation startedAt answeredAt endedAt endedBy updatedAt');
        if (!session) return ack?.({ ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy cuộc gọi.' });
        ack?.({ ok: true, session });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('conversation:join', async ({ conversationId }, ack) => {
      const exists = await Conversation.exists({ _id: conversationId, 'members.user': userId });
      if (!exists) return ack?.({ ok: false, message: 'Forbidden' });
      socket.join(`conversation:${conversationId}`);
      ack?.({ ok: true });
    });

    socket.on('message:send', async (payload, ack) => {
      try {
        const message = await createMessage({ io, userId, payload });
        ack?.({ ok: true, message });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('message:delivered', async ({ messageId } = {}) => {
      // Các thẻ cuộc gọi ảo có id dạng `call-event-...`, không phải ObjectId của Message.
      // Bỏ qua chúng để Mongoose không CastError và làm sập toàn bộ server.
      if (!mongoose.isValidObjectId(messageId)) return;

      try {
        const message = await Message.findById(messageId);
        if (!message) return;
        const receipt = message.receipts.find((r) => String(r.user) === userId);
        if (receipt && !receipt.deliveredAt) {
          receipt.deliveredAt = new Date();
          await message.save();
          socket.to(`conversation:${message.conversation}`).emit('message:delivered', {
            messageId,
            userId,
            deliveredAt: receipt.deliveredAt
          });
        }
      } catch (error) {
        // Socket listener không được ném lỗi chưa xử lý vì sẽ làm tiến trình Node thoát.
        console.error('message:delivered failed:', error.message);
      }
    });

    socket.on('typing:start', ({ conversationId }) => socket.to(`conversation:${conversationId}`).emit('typing:start', { conversationId, userId, displayName: socket.user.displayName }));
    socket.on('typing:stop', ({ conversationId }) => socket.to(`conversation:${conversationId}`).emit('typing:stop', { conversationId, userId }));

    socket.on('call:invite', async ({ callSessionId }, ack) => {
      try {
        const session = await CallSession.findOne({ _id: callSessionId, startedBy: userId, status: 'ringing' });
        if (!session) return ack?.({ ok: false, message: 'Cuộc gọi không hợp lệ hoặc đã kết thúc.' });

        clearCallDisconnectGrace(session._id, userId);
        socket.join(callSessionRoom(session._id));
        socket.data.callSessionIds.add(String(session._id));

        const result = await dispatchIncomingCall({
          io,
          callSessionId: session._id,
          caller: socket.user
        });
        ack?.({ ok: true, duplicate: Boolean(result?.duplicate) });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('call:accept', async ({ callSessionId }, ack) => {
      try {
        const session = await CallSession.findOne({
          _id: callSessionId,
          status: { $in: ['ringing', 'active'] },
          $or: [{ invitees: userId }, { startedBy: userId }]
        });
        if (!session) return ack?.({ ok: false, message: 'Cuộc gọi đã kết thúc.' });

        const conflicting = await CallSession.exists({
          _id: { $ne: session._id },
          status: { $in: ['ringing', 'active'] },
          $or: [
            { startedBy: userId },
            { invitees: userId },
            { 'participants.user': userId, 'participants.leftAt': null }
          ]
        });
        if (conflicting) {
          io.to(`user:${session.startedBy}`).emit('call:busy', { callSessionId: session._id, userId });
          return ack?.({ ok: false, code: 'USER_BUSY', message: 'Bạn đang bận trong cuộc gọi khác.' });
        }

        session.status = 'active';
        session.answeredAt ||= new Date();
        if (!session.participants.some((item) => String(item.user) === userId && !item.leftAt)) {
          session.participants.push({ user: userId, joinedAt: new Date() });
        }
        await session.save();
        cancelIncomingCallPush({ session, userIds: [userId], status: 'active' })
          .catch((error) => console.error('Cancel incoming call push error:', error.message));
        clearCallDisconnectGrace(session._id, userId);
        socket.join(callSessionRoom(session._id));
        socket.data.callSessionIds.add(String(session._id));
        io.to(`user:${session.startedBy}`).emit('call:accepted', { callSessionId: session._id, userId, displayName: socket.user.displayName });
        socket.to(`user:${userId}`).emit('call:answered-elsewhere', { callSessionId: session._id, userId });
        io.to(callSessionRoom(session._id)).emit('call:accepted', { callSessionId: session._id, userId, displayName: socket.user.displayName });
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('call:decline', async ({ callSessionId }, ack) => {
      try {
        const session = await CallSession.findOne({ _id: callSessionId, invitees: userId });
        if (!session) return ack?.({ ok: false, message: 'Không tìm thấy cuộc gọi.' });
        const finalized = await finalizeCall({ io, session, status: session.status === 'ringing' ? 'declined' : 'ended', endedBy: userId });
        const payload = {
          callSessionId: finalized._id,
          userId,
          displayName: socket.user.displayName,
          status: finalized.status
        };
        io.to(`user:${finalized.startedBy}`).emit('call:declined', payload);
        io.to(callSessionRoom(finalized._id)).emit('call:declined', payload);
        ack?.({ ok: true, status: finalized.status });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('call:join', async ({ conversationId, callSessionId, mode }, ack) => {
      const conversation = await Conversation.findOne({ _id: conversationId, 'members.user': userId });
      const session = await CallSession.findOne({ _id: callSessionId, conversation: conversationId, status: { $in: ['ringing', 'active'] } });
      if (!conversation || !session) return ack?.({ ok: false, message: 'Cuộc gọi không hợp lệ hoặc đã kết thúc.' });
      const room = callRoom(callSessionId);
      const participantSockets = [...(io.sockets.adapter.rooms.get(room) || [])].filter((id) => id !== socket.id);
      clearCallDisconnectGrace(callSessionId, userId);
      socket.join(room);
      socket.join(callSessionRoom(callSessionId));
      socket.data.callSessionIds.add(String(callSessionId));
      if (!session.participants.some((item) => String(item.user) === userId && !item.leftAt)) {
        session.participants.push({ user: userId, joinedAt: new Date() });
        await session.save();
      }
      socket.to(room).emit('call:participant-joined', { socketId: socket.id, userId, displayName: socket.user.displayName, avatar: socket.user.avatar, mode });
      ack?.({ ok: true, participants: participantSockets });
    });

    socket.on('webrtc:offer', ({ target, conversationId, callSessionId, sdp }) => io.to(target).emit('webrtc:offer', { from: socket.id, conversationId, callSessionId, sdp, user: { id: userId, displayName: socket.user.displayName, avatar: socket.user.avatar } }));
    socket.on('webrtc:answer', ({ target, conversationId, callSessionId, sdp }) => io.to(target).emit('webrtc:answer', { from: socket.id, conversationId, callSessionId, sdp }));
    socket.on('webrtc:ice-candidate', ({ target, conversationId, callSessionId, candidate }) => io.to(target).emit('webrtc:ice-candidate', { from: socket.id, conversationId, callSessionId, candidate }));

    const finalizeDisconnectedCall = async (callSessionId, disconnectedUserId) => {
      const id = String(callSessionId || '');
      if (!id) return;

      const sessionRoom = callSessionRoom(id);
      const connectedSocketIds = [...(io.sockets.adapter.rooms.get(sessionRoom) || [])];
      const sameUserReconnected = connectedSocketIds.some((socketId) =>
        String(io.sockets.sockets.get(socketId)?.user?._id || '') === String(disconnectedUserId)
      );
      if (sameUserReconnected) return;

      const session = await CallSession.findById(id);
      if (!session || TERMINAL_CALL_STATUSES.includes(session.status)) return;

      const participant = [...session.participants]
        .reverse()
        .find((item) => String(item.user) === String(disconnectedUserId) && !item.leftAt);
      if (participant) participant.leftAt = new Date();
      await session.save();

      io.to(sessionRoom).emit('call:participant-left', {
        callSessionId: id,
        userId: String(disconnectedUserId),
        reason: 'socket-disconnected'
      });

      const conversation = await Conversation.findById(session.conversation).select('type');
      const remainingCallSockets = connectedSocketIds.filter((socketId) => {
        const peer = io.sockets.sockets.get(socketId);
        return peer?.rooms?.has(sessionRoom);
      });
      const mustEndForEveryone = conversation?.type !== 'group' || remainingCallSockets.length === 0;
      if (mustEndForEveryone) {
        await finalizeCall({
          io,
          session,
          status: session.status === 'ringing' ? 'missed' : 'ended',
          endedBy: disconnectedUserId
        });
      }
    };

    const leaveCallSession = async (callSessionId, { disconnecting = false } = {}) => {
      const id = String(callSessionId || '');
      if (!id) return;

      socket.data.callSessionIds.delete(id);

      if (disconnecting) {
        // Opening the native Jitsi activity can briefly reconnect Socket.IO on
        // Android. Do not end the call immediately during that transition.
        clearCallDisconnectGrace(id, userId);
        const key = callDisconnectKey(id, userId);
        const timer = setTimeout(() => {
          callDisconnectTimers.delete(key);
          finalizeDisconnectedCall(id, userId)
            .catch((error) => console.error('Call disconnect grace cleanup error:', error.message));
        }, 30_000);
        timer.unref?.();
        callDisconnectTimers.set(key, timer);
        return;
      }

      clearCallDisconnectGrace(id, userId);
      const room = callRoom(id);
      const sessionRoom = callSessionRoom(id);
      const session = await CallSession.findById(id);
      if (!session || TERMINAL_CALL_STATUSES.includes(session.status)) {
        socket.leave(room);
        socket.leave(sessionRoom);
        return;
      }

      const participant = [...session.participants]
        .reverse()
        .find((item) => String(item.user) === userId && !item.leftAt);
      if (participant) participant.leftAt = new Date();
      await session.save();

      const sessionSocketIds = [...(io.sockets.adapter.rooms.get(sessionRoom) || [])]
        .filter((socketId) => socketId !== socket.id);
      const sameUserStillConnected = sessionSocketIds.some((socketId) =>
        String(io.sockets.sockets.get(socketId)?.user?._id || '') === userId
      );

      if (!sameUserStillConnected) {
        io.to(sessionRoom).emit('call:participant-left', {
          callSessionId: id,
          socketId: socket.id,
          userId,
          reason: 'explicit-leave'
        });
        const conversation = await Conversation.findById(session.conversation).select('type');
        const mustEndForEveryone = conversation?.type !== 'group' || sessionSocketIds.length === 0;
        if (mustEndForEveryone) {
          await finalizeCall({
            io,
            session,
            status: session.status === 'ringing' ? 'missed' : 'ended',
            endedBy: userId
          });
        }
      }

      socket.leave(room);
      socket.leave(sessionRoom);
    };

    socket.on('call:leave', async ({ callSessionId }, ack) => {
      try {
        await leaveCallSession(callSessionId);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });



    const canJoinMeetingRtc = async (meetingId) => {
      const meeting = await Meeting.findById(meetingId)
        .populate('createdBy', 'displayName avatar')
        .populate('participants.user', 'displayName avatar');
      if (!meeting) return { ok: false, message: 'Không tìm thấy phòng họp.' };
      if (['ended', 'cancelled'].includes(String(meeting.status))) return { ok: false, message: 'Phòng họp đã kết thúc.' };
      const isCreator = String(meeting.createdBy?._id || meeting.createdBy) === userId;
      const isParticipant = meeting.participants?.some((item) => String(item.user?._id || item.user) === userId);
      let isConversationMember = false;
      if (!isCreator && !isParticipant && meeting.conversation) {
        isConversationMember = Boolean(await Conversation.exists({ _id: meeting.conversation, 'members.user': userId }));
      }
      const allowed = meeting.visibility === 'public' || isCreator || isParticipant || isConversationMember;
      if (!allowed) return { ok: false, message: 'Bạn không có quyền vào phòng họp này.' };
      return { ok: true, meeting };
    };

    const leaveMeetingRtc = async (meetingId, { disconnecting = false } = {}) => {
      const id = String(meetingId || '');
      if (!id || !socket.data.meetingRtcIds.has(id)) return;
      const room = meetingRtcRoom(id);
      socket.data.meetingRtcIds.delete(id);
      socket.to(room).emit('meeting:rtc:participant-left', { meetingId: id, socketId: socket.id, userId });
      if (!disconnecting) socket.leave(room);
    };

    socket.on('meeting:rtc:join', async ({ meetingId }, ack) => {
      try {
        const id = String(meetingId || '');
        const access = await canJoinMeetingRtc(id);
        if (!access.ok) return ack?.(access);
        const room = meetingRtcRoom(id);
        const existing = [...(io.sockets.adapter.rooms.get(room) || [])]
          .filter((socketId) => socketId !== socket.id)
          .map((socketId) => {
            const peer = io.sockets.sockets.get(socketId);
            return {
              socketId,
              user: {
                _id: String(peer?.user?._id || ''),
                displayName: peer?.user?.displayName || 'Người tham gia',
                avatar: peer?.user?.avatar || ''
              }
            };
          });
        socket.join(room);
        socket.data.meetingRtcIds.add(id);
        const myUser = { _id: userId, displayName: socket.user.displayName, avatar: socket.user.avatar };
        socket.to(room).emit('meeting:rtc:participant-joined', { meetingId: id, socketId: socket.id, user: myUser });
        ack?.({ ok: true, meetingId: id, participants: existing, user: myUser });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('meeting:rtc:leave', async ({ meetingId }, ack) => {
      try {
        await leaveMeetingRtc(meetingId);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });

    const relayMeetingRtcSignal = (eventName, payload = {}) => {
      const id = String(payload.meetingId || '');
      const target = String(payload.target || '');
      if (!id || !target || !socket.rooms.has(meetingRtcRoom(id))) return;
      const targetSocket = io.sockets.sockets.get(target);
      if (!targetSocket?.rooms?.has(meetingRtcRoom(id))) return;
      io.to(target).emit(eventName, {
        ...payload,
        meetingId: id,
        from: socket.id,
        user: { _id: userId, displayName: socket.user.displayName, avatar: socket.user.avatar }
      });
    };

    socket.on('meeting:rtc:offer', (payload) => relayMeetingRtcSignal('meeting:rtc:offer', payload));
    socket.on('meeting:rtc:answer', (payload) => relayMeetingRtcSignal('meeting:rtc:answer', payload));
    socket.on('meeting:rtc:ice-candidate', (payload) => relayMeetingRtcSignal('meeting:rtc:ice-candidate', payload));

    socket.on('disconnecting', () => {
      for (const callSessionId of [...socket.data.callSessionIds]) {
        leaveCallSession(callSessionId, { disconnecting: true })
          .catch((error) => console.error('Call disconnect cleanup error:', error.message));
      }
      for (const streamId of [...socket.data.liveStreams.keys()]) {
        leaveLiveStream(streamId, { disconnecting: true })
          .catch((error) => console.error('Live disconnect cleanup error:', error.message));
      }
      for (const meetingId of [...socket.data.meetingRtcIds]) {
        leaveMeetingRtc(meetingId, { disconnecting: true })
          .catch((error) => console.error('Meeting RTC disconnect cleanup error:', error.message));
      }
    });

    socket.on('disconnect', async () => {
      const nextCount = Math.max(0, (onlineCounts.get(userId) || 1) - 1);
      if (nextCount === 0) {
        onlineCounts.delete(userId);
        await User.updateOne({ _id: userId }, { lastOnlineAt: new Date() });
        io.emit('presence:update', { userId, online: false, at: new Date() });
      } else {
        onlineCounts.set(userId, nextCount);
      }
    });
  });
}
