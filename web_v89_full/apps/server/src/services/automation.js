import crypto from 'node:crypto';
import axios from 'axios';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { BotRule, Webhook } from '../models/Integration.js';

function matches(rule, text) {
  const source = String(text || '');
  if (rule.matchType === 'equals') return source.toLowerCase() === rule.pattern.toLowerCase();
  if (rule.matchType === 'regex') {
    try { return new RegExp(rule.pattern, 'i').test(source); } catch { return false; }
  }
  return source.toLowerCase().includes(rule.pattern.toLowerCase());
}

async function dispatchWebhook(webhook, event, data) {
  const body = JSON.stringify({ event, data, createdAt: new Date().toISOString() });
  const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
  await axios.post(webhook.url, JSON.parse(body), {
    timeout: 5000,
    headers: { 'x-nexora-signature': signature, 'content-type': 'application/json' }
  });
}

export async function handleOfficialAutomation({ io, conversation, message, senderId }) {
  if (!conversation.officialAccount || message.kind !== 'text' || message.metadata?.automated) return;
  if (String(conversation.officialAccount) === String(senderId)) return;

  const [rules, webhooks] = await Promise.all([
    BotRule.find({ owner: conversation.officialAccount, isActive: true }),
    Webhook.find({ owner: conversation.officialAccount, isActive: true, events: 'message.created' })
  ]);

  for (const webhook of webhooks) {
    dispatchWebhook(webhook, 'message.created', {
      conversationId: conversation._id,
      messageId: message._id,
      senderId,
      text: message.text
    }).catch((error) => console.error('Webhook error:', error.message));
  }

  const rule = rules.find((item) => matches(item, message.text));
  if (!rule) return;

  const botMessage = await Message.create({
    conversation: conversation._id,
    sender: conversation.officialAccount,
    kind: 'text',
    text: rule.responseText,
    metadata: { automated: true, ruleId: rule._id }
  });
  conversation.lastMessage = botMessage._id;
  conversation.lastMessageAt = botMessage.createdAt;
  await conversation.save();
  const populated = await Message.findById(botMessage._id).populate('sender', 'displayName avatar accountType verified');
  io.to(`conversation:${conversation._id}`).emit('message:new', populated);
}
