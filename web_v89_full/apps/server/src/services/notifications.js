import Notification from '../models/Notification.js';
import { sendPushToUser } from './push.js';

export async function createNotification(io, payload) {
  const notification = await Notification.create(payload);
  const populated = await notification.populate('actor', 'displayName avatar');
  io?.to(`user:${payload.recipient}`).emit('notification:new', populated);
  sendPushToUser(payload.recipient, populated.toObject()).catch((error) => console.error('Push error:', error.message));
  return populated;
}
