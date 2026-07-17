import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, required: true },
  title: String,
  body: String,
  data: mongoose.Schema.Types.Mixed,
  readAt: Date
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });
export default mongoose.model('Notification', notificationSchema);
