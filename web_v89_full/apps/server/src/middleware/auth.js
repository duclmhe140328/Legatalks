import { verifyAccessToken } from '../utils/tokens.js';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Bạn chưa đăng nhập.' });

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ.' });

    const session = user.sessions.id(payload.sid);
    if (!session || session.revokedAt) return res.status(401).json({ message: 'Phiên đăng nhập đã hết hiệu lực.' });

    session.lastSeenAt = new Date();
    await user.save();
    req.user = user;
    req.sessionId = payload.sid;
    next();
  } catch {
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
}
