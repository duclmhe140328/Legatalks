import mongoose from 'mongoose';

const liveStreamSchema = new mongoose.Schema({
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 2000 },
  visibility: { type: String, enum: ['public', 'friends'], default: 'public', index: true },
  broadcastMode: { type: String, enum: ['camera-mic', 'camera', 'audio'], default: 'camera-mic' },
  status: { type: String, enum: ['live', 'ended'], default: 'live', index: true },
  startedAt: { type: Date, default: Date.now, index: true },
  endedAt: Date,
  currentViewers: { type: Number, default: 0, min: 0 },
  peakViewers: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

liveStreamSchema.index({ status: 1, startedAt: -1 });
export default mongoose.model('LiveStream', liveStreamSchema);
