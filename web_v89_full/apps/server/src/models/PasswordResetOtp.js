import mongoose from 'mongoose';

const passwordResetOtpSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['reset'],
      default: 'reset',
      required: true,
      index: true,
    },
    codeHash: {
      type: String,
      required: true,
      select: false,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    consumedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

passwordResetOtpSchema.index({
  user: 1,
  phone: 1,
  email: 1,
  purpose: 1,
  createdAt: -1,
});

export default mongoose.model('PasswordResetOtp', passwordResetOtpSchema);
