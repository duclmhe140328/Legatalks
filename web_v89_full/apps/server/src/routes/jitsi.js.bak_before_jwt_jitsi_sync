import express from 'express';
import CallSession from '../models/CallSession.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ensureMember } from '../services/messageService.js';
import { createJitsiJoinConfig, safeJitsiRoom } from '../services/jitsiToken.js';

const router = express.Router();
router.use(requireAuth);

router.post('/token', asyncHandler(async (req, res) => {
  const purpose = String(req.body.purpose || 'meeting').trim().toLowerCase();
  const callSessionId = String(req.body.callSessionId || '').trim();
  let room = safeJitsiRoom(req.body.room);
  let moderator = false;

  if (purpose === 'call' || callSessionId) {
    if (!callSessionId) return res.status(400).json({ message: 'Missing callSessionId.' });

    const session = await CallSession.findById(callSessionId)
      .select('_id conversation startedBy invitees participants mode status');
    if (!session) return res.status(404).json({ message: 'Call not found.' });

    await ensureMember(session.conversation, req.user._id);
    if (!['ringing', 'active'].includes(String(session.status))) {
      return res.status(409).json({ message: 'Call has ended.' });
    }

    room = safeJitsiRoom(`nexora-call-${session._id}`);
    moderator = String(session.startedBy) === String(req.user._id);

    return res.json({
      ...createJitsiJoinConfig({ room, user: req.user, moderator, purpose: 'call' }),
      callSessionId: String(session._id),
      mode: session.mode,
    });
  }

  if (!room) return res.status(400).json({ message: 'Missing or invalid Jitsi room.' });
  moderator = req.body.moderator !== false;
  return res.json(createJitsiJoinConfig({ room, user: req.user, moderator, purpose }));
}));

export default router;
