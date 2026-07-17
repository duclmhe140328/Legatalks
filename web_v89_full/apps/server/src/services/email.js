import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(currentDir, '../..');
const monorepoRoot = path.resolve(serverRoot, '../..');

for (const candidate of [
  path.join(process.cwd(), '.env'),
  path.join(serverRoot, '.env'),
  path.join(monorepoRoot, '.env'),
]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
  }
}

export function hasEmailOtpConfigured() {
  const user = String(
    process.env.GMAIL_USER ||
    process.env.EMAIL_USER ||
    process.env.SMTP_USER ||
    '',
  ).trim();

  const pass = String(
    process.env.GMAIL_APP_PASSWORD ||
    process.env.EMAIL_PASS ||
    process.env.SMTP_PASS ||
    '',
  ).trim();

  return Boolean(user && pass);
}

export async function sendOtpEmail(email, code, purpose = 'login') {
  const to = String(email || '').trim().toLowerCase();

  if (!to) {
    throw Object.assign(new Error('Thiếu địa chỉ Gmail nhận OTP.'), { status: 400 });
  }

  const gmailUser = String(
    process.env.GMAIL_USER ||
    process.env.EMAIL_USER ||
    process.env.SMTP_USER ||
    '',
  ).trim();

  const gmailPass = String(
    process.env.GMAIL_APP_PASSWORD ||
    process.env.EMAIL_PASS ||
    process.env.SMTP_PASS ||
    '',
  ).trim();

  const from = String(
    process.env.EMAIL_FROM ||
    (gmailUser ? `Nexora Connect <${gmailUser}>` : ''),
  ).trim();

  if (!gmailUser || !gmailPass) {
    throw Object.assign(
      new Error(
        'Backend chưa đọc được GMAIL_USER hoặc GMAIL_APP_PASSWORD. '
        + 'Kiểm tra .env tại project root và apps/server/.env rồi khởi động lại server.',
      ),
      { status: 500 },
    );
  }

  const subjectMap = {
    register: 'Mã OTP đăng ký Nexora Connect',
    login: 'Mã OTP đăng nhập Nexora Connect',
    reset: 'Mã OTP đặt lại mật khẩu Nexora Connect',
  };

  const subject = subjectMap[purpose] || 'Mã OTP Nexora Connect';
  const text =
    `Mã OTP Nexora Connect của bạn là ${code}. `
    + 'Mã chỉ có hiệu lực trong thời gian ngắn. Không chia sẻ mã này cho bất kỳ ai.';

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;padding:24px">
      <div style="max-width:520px;margin:auto;border:1px solid #e2e8f0;border-radius:22px;padding:24px;background:#ffffff">
        <div style="display:inline-block;background:linear-gradient(135deg,#1877f2,#7c3aed);color:#fff;font-size:20px;font-weight:800;border-radius:14px;padding:10px 14px">N</div>
        <h2 style="margin:18px 0 6px">${subject}</h2>
        <p style="margin:0;color:#64748b">Mã xác minh của bạn:</p>
        <div style="margin:18px 0;font-size:32px;font-weight:900;letter-spacing:8px;background:#eef4ff;color:#1877f2;padding:16px 20px;border-radius:16px;text-align:center">${code}</div>
        <p style="margin:0;color:#64748b">Không chia sẻ mã này cho bất kỳ ai.</p>
      </div>
    </div>
  `;

  try {
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.default.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    console.log(`[GMAIL OTP SENT] to=${to} purpose=${purpose}`);
    return { channel: 'email' };
  } catch (error) {
    console.error('Send Gmail OTP failed:', error.message);

    throw Object.assign(
      new Error(`Không gửi được OTP qua Gmail: ${error.message}`),
      { status: 500 },
    );
  }
}
