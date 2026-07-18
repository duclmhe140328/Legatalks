import mongoose from 'mongoose';

const callSessionSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mode: { type: String, enum: ['voice', 'video'], default: 'video' },
  invitees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  participants: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: Date,
    leftAt: Date
  }],
  startedAt: { type: Date, default: Date.now },
  answeredAt: Date,
  endedAt: Date,
  endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: Date,
  inviteNotifiedAt: Date,
  status: { type: String, enum: ['ringing', 'active', 'ended', 'missed', 'declined', 'busy'], default: 'ringing' },
  terminalNotifiedAt: Date
}, { timestamps: true });

export default mongoose.model('CallSession', callSessionSchema);
