import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true }
}, { _id: false });

const receiptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deliveredAt: Date,
  readAt: Date
}, { _id: false });

const messageSchema = new mongoose.Schema({
  clientId: { type: String, index: true },
  eventKey: { type: String, unique: true, sparse: true, index: true },
  callSession: { type: mongoose.Schema.Types.ObjectId, ref: 'CallSession', unique: true, sparse: true, index: true },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['text', 'image', 'video', 'file', 'audio', 'sticker', 'gif', 'system'], default: 'text' },
  text: { type: String, default: '', maxlength: 12000 },
  media: [{
    url: String,
    hdUrl: String,
    thumbUrl: String,
    name: String,
    mimeType: String,
    size: Number,
    duration: Number,
    width: Number,
    height: Number
  }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  reactions: [reactionSchema],
  receipts: [receiptSchema],
  revokedAt: Date,
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  editedAt: Date,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ text: 'text' });
messageSchema.index({ clientId: 1, sender: 1 }, { unique: true, sparse: true });

export default mongoose.model('Message', messageSchema);
