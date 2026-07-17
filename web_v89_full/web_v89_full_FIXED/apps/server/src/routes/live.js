import express from 'express';
import LiveStream from '../models/LiveStream.js';
import LiveComment from '../models/LiveComment.js';
import { requireAuth } from '../middleware/auth.js';
import {asyncHandler} from '../utils/asyncHandler.js';

const router = express.Router();

router.use(requireAuth);

function canView(stream, user) {
  if (!stream || !user) return false;

  const hostId = String(stream.host?._id || stream.host || '');
  if (hostId === String(user._id)) return true;

  const visibility = String(stream.visibility || stream.privacy || 'public');
  if (visibility === 'public') return true;

  return (user.friends || []).some((id) => String(id) === hostId);
}

function safeRoom(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '');
}

function liveRoomName(stream) {
  const id = String(stream?._id || '');
  const existing =
    stream?.mirotalkRoom ||
    stream?.broadcastRoom ||
    stream?.roomName ||
    stream?.room ||
    stream?.jitsiRoom ||
    stream?.jitsi_room;

  return safeRoom(existing || `nexora-live-${id}`);
}

function cleanBaseUrl(value, fallback) {
  const raw = String(value || fallback || '').trim().replace(/\/+$/, '');

  if (!raw) return fallback;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `https://${raw}`;
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname);
  } catch (_) {
    return false;
  }
}

function mirotalkApiUrl() {
  return cleanBaseUrl(
    process.env.MIROTALK_BRO_API_URL ||
      process.env.MIROTALK_BRO_URL ||
      process.env.MIROTALK_URL ||
      'https://bro.mirotalk.com',
    'https://bro.mirotalk.com',
  );
}

function mirotalkPublicUrl() {
  let publicUrl = cleanBaseUrl(
    process.env.MIROTALK_BRO_PUBLIC_URL ||
      process.env.MIROTALK_BRO_URL ||
      process.env.MIROTALK_URL ||
      'https://bro.mirotalk.com',
    'https://bro.mirotalk.com',
  );

  if (isLocalUrl(publicUrl)) {
    publicUrl = 'https://bro.mirotalk.com';
  }

  return publicUrl;
}

function rewriteJoinUrlForClient(joinUrl) {
  const publicBase = mirotalkPublicUrl();

  try {
    const url = new URL(joinUrl);

    if (isLocalUrl(url.toString())) {
      const base = new URL(publicBase);
      url.protocol = base.protocol;
      url.host = base.host;
      return url.toString();
    }

    return url.toString();
  } catch (_) {
    try {
      return new URL(joinUrl, publicBase).toString();
    } catch (error) {
      throw Object.assign(new Error('MiroTalk BRO trả về join URL không hợp lệ.'), { status: 502 });
    }
  }
}

function mirotalkApiKey() {
  return String(
    process.env.MIROTALK_BRO_API_KEY ||
      process.env.MIROTALK_API_KEY ||
      'mirotalkbro_default_secret',
  ).trim();
}

function emitLiveEnded(io, streamId, endedAt = new Date()) {
  io?.to(`live:${streamId}`).emit('live:comments:reset', { streamId });
  io?.to(`live:${streamId}`).emit('live:ended', { streamId, endedAt });
  io?.emit('live:comments:reset', { streamId });
  io?.emit('live:ended', { streamId, endedAt });
}

async function hardDeleteLive(stream, io) {
  if (!stream) return;

  const streamId = stream._id;
  const endedAt = new Date();

  await LiveComment.deleteMany({ stream: streamId });
  await LiveStream.deleteOne({ _id: streamId });

  emitLiveEnded(io, streamId, endedAt);
}

function createMiroTalkJoinUrl(room, role, displayName = 'Nexora') {
  // MiroTalk BRO không cần gọi /api/v1/join cho case này.
  // Direct URL chính thức:
  // Broadcaster: /broadcast?id=ROOM&name=NAME
  // Viewer:      /viewer?id=ROOM&name=NAME
  const base = mirotalkPublicUrl();
  const path = role === 'host' ? '/broadcast' : '/viewer';

  const url = new URL(path, `${base}/`);
  url.searchParams.set('id', room);
  url.searchParams.set('name', displayName || (role === 'host' ? 'Broadcaster' : 'Viewer'));

  return rewriteJoinUrlForClient(url.toString());
}


async function populateStream(stream) {
  if (!stream) return null;

  await stream.populate('host', 'displayName avatar verified username');
  const object = stream.toObject ? stream.toObject() : stream;

  object.provider = 'mirotalk-bro';
  object.broadcastProvider = 'mirotalk-bro';
  object.mirotalkBaseUrl = mirotalkPublicUrl();
  object.mirotalkPublicUrl = mirotalkPublicUrl();
  object.mirotalkRoom = liveRoomName(object);
  object.broadcastRoom = object.mirotalkRoom;

  // Giữ field cũ để client cũ không vỡ.
  object.roomName = object.mirotalkRoom;
  object.room = object.mirotalkRoom;
  object.jitsiRoom = object.mirotalkRoom;

  return object;
}

router.get('/', asyncHandler(async (req, res) => {
  const streams = await LiveStream.find({ status: 'live' })
    .sort({ createdAt: -1 })
    .populate('host', 'displayName avatar verified username');

  const visible = await Promise.all(
    streams
      .filter((stream) => canView(stream, req.user))
      .map((stream) => populateStream(stream)),
  );

  res.json(visible.filter(Boolean));
}));

router.post('/', asyncHandler(async (req, res) => {
  const io = req.app.get('io');

  // Một tài khoản chỉ có một live đang chạy. Tạo live mới thì xoá live/comment cũ.
  const oldLives = await LiveStream.find({ host: req.user._id });
  for (const oldLive of oldLives) {
    await hardDeleteLive(oldLive, io);
  }

  const title = String(req.body.title || 'Livestream mới').trim() || 'Livestream mới';
  const visibility = ['public', 'friends', 'private'].includes(req.body.visibility)
    ? req.body.visibility
    : ['public', 'friends', 'private'].includes(req.body.privacy)
      ? req.body.privacy
      : 'public';

  const stream = await LiveStream.create({
    host: req.user._id,
    title,
    visibility,
    status: 'live',
    startedAt: new Date(),
  });

  const populated = await populateStream(stream);

  io?.emit('live:new', populated);
  res.status(201).json(populated);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const stream = await LiveStream.findById(req.params.id)
    .populate('host', 'displayName avatar verified username');

  if (!stream || stream.status !== 'live' || !canView(stream, req.user)) {
    return res.status(404).json({ message: 'Livestream đã kết thúc hoặc không tồn tại.' });
  }

  res.json(await populateStream(stream));
}));

router.get('/:id/broadcast-join', asyncHandler(async (req, res) => {
  const stream = await LiveStream.findById(req.params.id)
    .populate('host', 'displayName avatar verified username');

  if (!stream || stream.status !== 'live' || !canView(stream, req.user)) {
    return res.status(404).json({ message: 'Livestream đã kết thúc hoặc không tồn tại.' });
  }

  const room = liveRoomName(stream);
  const requestedRole = String(req.query.role || '').toLowerCase() === 'host' ? 'host' : 'viewer';
  const hostId = String(stream.host?._id || stream.host || '');
  const isHost = hostId === String(req.user._id);

  if (requestedRole === 'host' && !isHost) {
    return res.status(403).json({ message: 'Chỉ chủ phòng được phát live.' });
  }

  const displayName = req.user?.displayName || req.user?.username || (isHost ? 'Broadcaster' : 'Viewer');
  const finalRole = isHost && requestedRole === 'host' ? 'host' : 'viewer';
  const joinUrl = createMiroTalkJoinUrl(room, finalRole, displayName);

  res.json({
    provider: 'mirotalk-bro',
    role: finalRole,
    requestedRole,
    room,
    join: joinUrl,
    joinUrl,
    baseUrl: mirotalkPublicUrl(),
    publicUrl: mirotalkPublicUrl(),
  });
}));

router.post('/:id/end', asyncHandler(async (req, res) => {
  const stream = await LiveStream.findOne({ _id: req.params.id, host: req.user._id });
  if (!stream) return res.status(404).json({ message: 'Không tìm thấy livestream.' });

  const streamId = stream._id;
  const endedAt = new Date();

  await hardDeleteLive(stream, req.app.get('io'));

  res.json({ ok: true, streamId, endedAt });
}));

router.get('/:id/comments', asyncHandler(async (req, res) => {
  const stream = await LiveStream.findById(req.params.id);

  if (!stream || stream.status !== 'live' || !canView(stream, req.user)) {
    return res.status(404).json({ message: 'Livestream đã kết thúc hoặc không tồn tại.' });
  }

  const comments = await LiveComment.find({ stream: stream._id })
    .sort({ createdAt: 1 })
    .limit(200)
    .populate('user', 'displayName avatar verified username');

  res.json(comments);
}));

router.post('/:id/comments', asyncHandler(async (req, res) => {
  const stream = await LiveStream.findById(req.params.id);

  if (!stream || stream.status !== 'live' || !canView(stream, req.user)) {
    return res.status(404).json({ message: 'Livestream đã kết thúc hoặc không tồn tại.' });
  }

  const text = String(req.body.text || req.body.body || req.body.content || '').trim();
  if (!text) return res.status(400).json({ message: 'Nội dung bình luận trống.' });

  const comment = await LiveComment.create({
    stream: stream._id,
    user: req.user._id,
    text,
  });

  await comment.populate('user', 'displayName avatar verified username');

  req.app.get('io')?.to(`live:${stream._id}`).emit('live:comment', comment);

  res.status(201).json(comment);
}));

export default router;
