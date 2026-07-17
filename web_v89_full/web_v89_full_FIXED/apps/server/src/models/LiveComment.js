import mongoose from 'mongoose';

const liveCommentSchema = new mongoose.Schema({
  stream: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 800 }
}, { timestamps: true });

liveCommentSchema.index({ stream: 1, createdAt: -1 });
export default mongoose.model('LiveComment', liveCommentSchema);
