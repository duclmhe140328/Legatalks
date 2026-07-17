import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['host', 'participant'], default: 'participant' },
  response: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  joinedAt: Date,
  leftAt: Date
}, { _id: false });

const meetingSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 2000 },
  roomName: { type: String, required: true, unique: true, index: true },
  jitsiDomain: { type: String, default: 'meet.jit.si' },
  visibility: { type: String, enum: ['private', 'public'], default: 'private', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', index: true },
  message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  participants: [participantSchema],
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true, index: true },
  durationMinutes: { type: Number, default: 60, min: 5, max: 1440 },
  status: { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled'], default: 'scheduled', index: true },
  actualStartedAt: Date,
  actualEndedAt: Date,
  settings: {
    requireDisplayName: { type: Boolean, default: true },
    startWithAudioMuted: { type: Boolean, default: false },
    startWithVideoMuted: { type: Boolean, default: false },
    disableInviteFunctions: { type: Boolean, default: true },
    disableDeepLinking: { type: Boolean, default: true },
    hideBranding: { type: Boolean, default: true }
  }
}, { timestamps: true });

meetingSchema.index({ 'participants.user': 1, startsAt: -1 });
meetingSchema.index({ conversation: 1, startsAt: -1 });
meetingSchema.index({ visibility: 1, startsAt: -1 });

export default mongoose.model('Meeting', meetingSchema);
