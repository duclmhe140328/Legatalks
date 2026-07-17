import bcrypt from 'bcryptjs';
import { connectDatabase } from './config/db.js';
import User from './models/User.js';
import Conversation from './models/Conversation.js';
import Message from './models/Message.js';
import Post from './models/Post.js';
import { BotRule, MiniApp } from './models/Integration.js';
import LiveStream from './models/LiveStream.js';
import LiveComment from './models/LiveComment.js';

await connectDatabase();
const reset = process.argv.includes('--reset');
const existingUsers = await User.countDocuments();
if (existingUsers > 0 && !reset) {
  console.log(`Seed skipped: database already contains ${existingUsers} users.`);
  console.log('Existing posts, videos, chats and call history were preserved.');
  console.log('Use npm run seed:reset only when you intentionally want to erase demo data.');
  process.exit(0);
}
if (reset) {
  await Promise.all([
    User.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    Post.deleteMany({}),
    BotRule.deleteMany({}),
    MiniApp.deleteMany({}),
    LiveStream.deleteMany({}),
    LiveComment.deleteMany({})
  ]);
}

const passwordHash = await bcrypt.hash('12345678', 12);
const [an, binh, shop] = await User.create([
  { phone: '84901111111', displayName: 'An Nguyễn', username: 'annguyen', passwordHash, bio: 'Thiết kế sản phẩm số ✨' },
  { phone: '84902222222', displayName: 'Bình Trần', username: 'binhtran', passwordHash, bio: 'Online mỗi ngày', avatar: 'https://i.pravatar.cc/300?img=12' },
  { phone: '84903333333', displayName: 'Nexora Shop', username: 'nexorashop', passwordHash, accountType: 'official', verified: true, officialCategory: 'Mua sắm', bio: 'Official Account demo' }
]);

an.avatar = 'https://i.pravatar.cc/300?img=5';
an.friends = [binh._id];
binh.friends = [an._id];
shop.followers = [an._id, binh._id];
an.followingOfficial = [shop._id];
binh.followingOfficial = [shop._id];
await Promise.all([an.save(), binh.save(), shop.save()]);

const direct = await Conversation.create({
  type: 'direct',
  directKey: [an._id.toString(), binh._id.toString()].sort().join(':'),
  members: [{ user: an._id, role: 'member' }, { user: binh._id, role: 'member' }],
  createdBy: an._id
});
const welcome = await Message.create({ conversation: direct._id, sender: binh._id, kind: 'text', text: 'Chào An! Đây là cuộc trò chuyện realtime demo 👋' });
direct.lastMessage = welcome._id;
direct.lastMessageAt = welcome.createdAt;
await direct.save();

const oaConversation = await Conversation.create({
  type: 'official',
  directKey: [an._id.toString(), shop._id.toString()].sort().join(':'),
  members: [{ user: an._id, role: 'member' }, { user: shop._id, role: 'owner' }],
  createdBy: an._id,
  officialAccount: shop._id
});
const oaWelcome = await Message.create({ conversation: oaConversation._id, sender: shop._id, kind: 'text', text: 'Xin chào! Gõ “giá” hoặc “hỗ trợ” để thử chatbot.' });
oaConversation.lastMessage = oaWelcome._id;
oaConversation.lastMessageAt = oaWelcome.createdAt;
await oaConversation.save();

await BotRule.create([
  { owner: shop._id, name: 'Báo giá', pattern: 'giá', responseText: 'Bạn vui lòng cho biết sản phẩm cần báo giá nhé.' },
  { owner: shop._id, name: 'Hỗ trợ', pattern: 'hỗ trợ', responseText: 'Nhân viên CSKH sẽ phản hồi sớm. Hotline demo: 1900 0000.' }
]);
await MiniApp.create({
  owner: shop._id,
  name: 'Nexora Mini Store',
  description: 'Mini app mua sắm mẫu chạy trong WebView.',
  icon: '🛍️',
  launchUrl: 'https://example.com',
  scopes: ['profile', 'payment'],
  isPublished: true
});
await Post.create([
  { author: an._id, text: 'Chào mừng đến với Nexora Connect! Đây là bài viết đầu tiên.', privacy: 'public', likes: [binh._id] },
  { author: binh._id, text: 'Timeline, chat, gọi video và mini app nằm trong cùng một nền tảng.', privacy: 'friends' }
]);

console.log('Seed completed. Demo accounts:');
console.log('An: 0901111111 / 12345678');
console.log('Bình: 0902222222 / 12345678');
console.log('OA: 0903333333 / 12345678');
process.exit(0);
