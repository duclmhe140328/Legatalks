import mongoose from 'mongoose';

const commentMediaSchema = new mongoose.Schema({
  url: { type: String, required: true },
  thumbUrl: String,
  name: String,
  mimeType: String,
  size: Number,
  duration: Number
}, { _id: false });

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parentComment: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  kind: { type: String, enum: ['text', 'sticker', 'image', 'audio'], default: 'text' },
  text: { type: String, default: '', maxlength: 2000 },
  media: [commentMediaSchema],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

commentSchema.pre('validate', function validateComment() {
  const hasText = Boolean(String(this.text || '').trim());
  const hasMedia = Array.isArray(this.media) && this.media.some((item) => item?.url);
  if (!hasText && !hasMedia) throw new Error('Bình luận cần có nội dung, sticker, ảnh hoặc âm thanh.');
});

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  repostOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null, index: true },
  text: { type: String, default: '', maxlength: 10000 },
  media: [{ url: String, type: { type: String, enum: ['image', 'video'] }, thumbUrl: String }],
  contentType: { type: String, enum: ['post', 'video', 'story'], default: 'post', index: true },
  location: { name: String, lat: Number, lng: Number },
  privacy: { type: String, enum: ['public', 'friends', 'only_me', 'except', 'group'], default: 'friends' },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityGroup', default: null, index: true },
  excludedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema],
  shareCount: { type: Number, default: 0, min: 0 },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

postSchema.index({ createdAt: -1 });

export default mongoose.model('Post', postSchema);
