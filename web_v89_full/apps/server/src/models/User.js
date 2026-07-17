import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  deviceId: { type: String, required: true },
  deviceName: String,
  userAgent: String,
  ip: String,
  refreshTokenHash: { type: String, required: true },
  pushToken: String,
  pushPlatform: { type: String, enum: ['web', 'android', 'ios'] },
  pushEnvironment: { type: String, enum: ['development', 'production'], default: 'development' },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  revokedAt: Date
});

const passkeySchema = new mongoose.Schema({
  credentialId: { type: String, required: true },
  publicKey: { type: Buffer, required: true },
  counter: { type: Number, default: 0 },
  transports: [String],
  deviceType: String,
  backedUp: Boolean,
  name: { type: String, default: 'Thiết bị sinh trắc học' },
  createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, index: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  displayName: { type: String, required: true, trim: true, maxlength: 80 },
  username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  bio: { type: String, default: '', maxlength: 240 },
  avatar: { type: String, default: '' },
  cover: { type: String, default: '' },
  accountType: { type: String, enum: ['personal', 'official'], default: 'personal' },
  officialCategory: String,
  verified: { type: Boolean, default: false },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequestsIncoming: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequestsOutgoing: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  followingOfficial: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  contactHashes: [{ type: String }],
  sessions: [sessionSchema],
  passkeys: [passkeySchema],
  webauthnChallenge: String,
  settings: {
    lastSeenVisibility: { type: String, enum: ['everyone', 'friends', 'nobody'], default: 'friends' },
    readReceipts: { type: Boolean, default: true },
    allowFriendRequests: { type: Boolean, default: true },
    allowMessagesFromStrangers: { type: Boolean, default: true },
    discoverableByPhone: { type: Boolean, default: true },
    discoverableByQr: { type: Boolean, default: true }
  },
  isActive: { type: Boolean, default: true },
  lastOnlineAt: { type: Date, default: Date.now }
}, { timestamps: true, toJSON: { virtuals: true } });

userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  delete obj.sessions;
  delete obj.passkeys;
  delete obj.webauthnChallenge;
  delete obj.contactHashes;
  return obj;
};

export default mongoose.model('User', userSchema);
