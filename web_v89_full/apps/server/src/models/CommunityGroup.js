import mongoose from 'mongoose';

const requestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedAt: { type: Date, default: Date.now }
}, { _id: false });

const communityGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  avatar: { type: String, default: '' },
  cover: { type: String, default: '' },
  description: { type: String, default: '', maxlength: 2000 },
  privacy: { type: String, enum: ['public', 'private'], default: 'public', index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
  pendingRequests: [requestSchema],
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', unique: true, sparse: true, index: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

communityGroupSchema.index({ members: 1, updatedAt: -1 });
communityGroupSchema.index({ name: 'text', description: 'text' });

export default mongoose.model('CommunityGroup', communityGroupSchema);
