import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
  mutedUntil: Date,
  nickname: String
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['direct', 'group', 'official'], required: true },
  directKey: { type: String, unique: true, sparse: true, index: true },
  name: String,
  avatar: String,
  description: String,
  members: [memberSchema],
  pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  lastMessageAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  officialAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  communityGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityGroup', unique: true, sparse: true, index: true }
}, { timestamps: true });

conversationSchema.index({ 'members.user': 1, lastMessageAt: -1 });

export default mongoose.model('Conversation', conversationSchema);
