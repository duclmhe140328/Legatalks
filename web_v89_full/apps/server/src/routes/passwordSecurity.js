import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';

import User from '../models/User.js';
import PasswordResetOtp from '../models/PasswordResetOtp.js';
import { requireAuth } from '../middleware/auth.js';
import { sendOtpEmail } from '../services/email.js';
import {env} from '../config/env.js';

const router = express.Router();

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const forgotLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Bạn gửi yêu cầu quá nhiều lần. Vui lòng thử lại sau.',
  },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Bạn thử OTP quá nhiều lần. Vui lòng thử lại sau.',
  },
});

function normalizePhone(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/^\+/, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validatePairInput(phone, email) {
  if (!phone || !email) {
    throw Object.assign(
      new Error('Phải nhập đúng cả số điện thoại và Gmail đã đăng ký.'),
      { status: 400 },
    );
  }

  if (!/^[0-9]{8,15}$/.test(phone)) {
    throw Object.assign(
      new Error('Số điện thoại không hợp lệ.'),
      { status: 400 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(
      new Error('Gmail không hợp lệ.'),
      { status: 400 },
    );
  }
}

function randomOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function resetOtpHash({ userId, phone, email, code }) {
  return crypto
    .createHash('sha256')
    .update(
      [
        String(userId),
        phone,
        email,
        'reset',
        code,
        env.jwtAccessSecret,
      ].join(':'),
    )
    .digest('hex');
}

async function findExactAccount(phone, email) {
  return User.findOne({
    phone,
    email,
    isActive: { $ne: false },
  }).select('+passwordHash');
}

router.post(
  '/forgot-password',
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const email = normalizeEmail(req.body.email);

    validatePairInput(phone, email);

    // This is an exact AND match, never an OR match.
    const user = await findExactAccount(phone, email);

    if (!user) {
      return res.status(400).json({
        message:
          'Số điện thoại và Gmail không cùng thuộc một tài khoản hoặc tài khoản không tồn tại.',
      });
    }

    const code = randomOtp();
    const expiresAt = new Date(
      Date.now() + Number(env.otpTtlMinutes || 5) * 60_000,
    );

    await PasswordResetOtp.updateMany(
      {
        user: user._id,
        purpose: 'reset',
        consumedAt: null,
      },
      {
        $set: { consumedAt: new Date() },
      },
    );

    await PasswordResetOtp.create({
      user: user._id,
      phone,
      email,
      purpose: 'reset',
      codeHash: resetOtpHash({
        userId: user._id,
        phone,
        email,
        code,
      }),
      expiresAt,
    });

    await sendOtpEmail(email, code, 'reset');

    return res.json({
      message: 'Đã gửi OTP về Gmail khớp với số điện thoại này.',
      expiresInSeconds: Number(env.otpTtlMinutes || 5) * 60,
    });
  }),
);

router.post(
  '/reset-password',
  resetLimiter,
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();
    const newPassword = String(
      req.body.newPassword || req.body.password || '',
    );

    validatePairInput(phone, email);

    if (!/^[0-9]{6}$/.test(otp)) {
      return res.status(400).json({ message: 'OTP phải gồm đúng 6 chữ số.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Mật khẩu mới phải từ 6 ký tự trở lên.',
      });
    }

    const user = await findExactAccount(phone, email);

    if (!user) {
      return res.status(400).json({
        message:
          'Số điện thoại và Gmail không cùng thuộc một tài khoản hoặc tài khoản không tồn tại.',
      });
    }

    const record = await PasswordResetOtp.findOne({
      user: user._id,
      phone,
      email,
      purpose: 'reset',
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select('+codeHash')
      .sort({ createdAt: -1 });

    if (!record) {
      return res.status(400).json({
        message: 'OTP không tồn tại, đã hết hạn hoặc đã được sử dụng.',
      });
    }

    if (record.attempts >= 5) {
      return res.status(429).json({
        message: 'OTP đã bị khóa do nhập sai quá nhiều lần.',
      });
    }

    const expectedHash = resetOtpHash({
      userId: user._id,
      phone,
      email,
      code: otp,
    });

    const actualBuffer = Buffer.from(record.codeHash, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    const valid =
      actualBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(actualBuffer, expectedBuffer);

    if (!valid) {
      record.attempts += 1;
      await record.save();

      return res.status(400).json({
        message: 'Mã OTP không đúng.',
        attemptsRemaining: Math.max(0, 5 - record.attempts),
      });
    }

    if (
      user.passwordHash &&
      (await bcrypt.compare(newPassword, user.passwordHash))
    ) {
      return res.status(400).json({
        message: 'Mật khẩu mới phải khác mật khẩu cũ.',
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);

    // Reset password revokes every existing session.
    if (Array.isArray(user.sessions)) {
      const now = new Date();
      for (const session of user.sessions) {
        if (!session.revokedAt) session.revokedAt = now;
      }
    }

    record.consumedAt = new Date();

    await Promise.all([user.save(), record.save()]);

    return res.json({
      message:
        'Đã đặt lại mật khẩu. Tất cả phiên đăng nhập cũ đã bị thu hồi.',
    });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const currentPassword = String(
      req.body.currentPassword || req.body.oldPassword || '',
    );
    const newPassword = String(
      req.body.newPassword || req.body.password || '',
    );

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Nhập mật khẩu hiện tại và mật khẩu mới.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Mật khẩu mới phải từ 6 ký tự trở lên.',
      });
    }

    const user = await User.findById(req.user._id).select('+passwordHash');

    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(currentPassword, user.passwordHash))
    ) {
      return res.status(400).json({
        message: 'Mật khẩu hiện tại không đúng.',
      });
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({
        message: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);

    // Keep the current session, revoke all other devices.
    if (Array.isArray(user.sessions)) {
      const now = new Date();

      for (const session of user.sessions) {
        if (
          String(session._id) !== String(req.sessionId) &&
          !session.revokedAt
        ) {
          session.revokedAt = now;
        }
      }
    }

    await user.save();

    return res.json({
      message:
        'Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.',
    });
  }),
);

export default router;
