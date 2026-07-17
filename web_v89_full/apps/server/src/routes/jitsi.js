import express from 'express';

import CallSession from '../models/CallSession.js';
import Meeting from '../models/Meeting.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createJitsiToken,
  getJitsiPublicConfig,
  normalizeJitsiRoom,
} from '../services/jitsiToken.js';

const router = express.Router();

router.use(requireAuth);

function idOf(value) {
  return String(value?._id || value?.id || value || '');
}

function userIsInCall(session, userId) {
  if (!session) return false;

  if (idOf(session.startedBy) === userId) return true;

  if (
    Array.isArray(session.invitees) &&
    session.invitees.some((item) => idOf(item) === userId)
  ) {
    return true;
  }

  return Array.isArray(session.participants) &&
    session.participants.some((item) => idOf(item?.user) === userId);
}

function userIsInMeeting(meeting, userId) {
  if (!meeting) return false;

  if (idOf(meeting.createdBy) === userId) return true;
  if (String(meeting.visibility || 'private') === 'public') return true;

  return Array.isArray(meeting.participants) &&
    meeting.participants.some((item) => idOf(item?.user) === userId);
}

function meetingRoom(meeting) {
  return normalizeJitsiRoom(
    meeting?.room ||
      meeting?.jitsiRoom ||
      meeting?.roomName ||
      `nexora-meeting-${idOf(meeting)}`,
  );
}

router.get('/config', asyncHandler(async (_req, res) => {
  const config = getJitsiPublicConfig();

  res.json({
    domain: config.domain,
    serverUrl: config.serverUrl,
    tokenTtlSeconds: config.tokenTtlSeconds,
  });
}));

router.post('/token', asyncHandler(async (req, res) => {
  const userId = idOf(req.user);
  const purpose = String(req.body?.purpose || 'meeting')
    .trim()
    .toLowerCase();

  let room = normalizeJitsiRoom(req.body?.room);
  let moderator = false;

  if (purpose === 'call') {
    const callSessionId = String(
      req.body?.callSessionId ||
        req.body?.sessionId ||
        '',
    ).trim();

    if (!callSessionId) {
      return res.status(400).json({
        message: 'Missing callSessionId.',
      });
    }

    const session = await CallSession.findById(callSessionId);

    if (!session) {
      return res.status(404).json({
        message: 'Call session not found.',
      });
    }

    if (!userIsInCall(session, userId)) {
      return res.status(403).json({
        message: 'You are not a participant of this call.',
      });
    }

    room = normalizeJitsiRoom(
      room || `nexora-call-${idOf(session)}`,
    );

    moderator = idOf(session.startedBy) === userId;
  } else if (purpose === 'meeting') {
    const meetingId = String(req.body?.meetingId || '').trim();

    if (meetingId) {
      const meeting = await Meeting.findById(meetingId);

      if (!meeting) {
        return res.status(404).json({
          message: 'Meeting not found.',
        });
      }

      if (!userIsInMeeting(meeting, userId)) {
        return res.status(403).json({
          message: 'You do not have permission to join this meeting.',
        });
      }

      room = normalizeJitsiRoom(room || meetingRoom(meeting));
      moderator = idOf(meeting.createdBy) === userId;
    } else {
      if (!room) {
        return res.status(400).json({
          message: 'Missing Jitsi room.',
        });
      }

      moderator = req.body?.moderator !== false;
    }
  } else {
    return res.status(400).json({
      message: `Unsupported Jitsi token purpose: ${purpose}`,
    });
  }

  const publicConfig = getJitsiPublicConfig();
  const signed = createJitsiToken({
    room,
    user: req.user,
    moderator,
  });

  res.json({
    serverUrl: publicConfig.serverUrl,
    domain: publicConfig.domain,
    room: signed.room,
    token: signed.token,
    expiresAt: signed.expiresAt,
    expiresIn: signed.expiresIn,
    moderator,
  });
}));

export default router;
