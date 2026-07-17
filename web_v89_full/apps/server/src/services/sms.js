import axios from 'axios';
import { env } from '../config/env.js';

export async function sendOtpSms(phone, code) {
  if (env.otpProvider === 'console') {
    console.log(`[DEV OTP] ${phone}: ${code}`);
    return { provider: 'console' };
  }

  if (env.otpProvider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !token || !from) throw new Error('Thiếu cấu hình Twilio.');
    const body = new URLSearchParams({
      To: `+${phone}`,
      From: from,
      Body: `Ma OTP Nexora Connect cua ban la ${code}. Ma co hieu luc ${env.otpTtlMinutes} phut.`
    });
    await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, body, {
      auth: { username: sid, password: token },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return { provider: 'twilio' };
  }

  throw new Error(`OTP_PROVIDER chưa được hỗ trợ: ${env.otpProvider}`);
}
