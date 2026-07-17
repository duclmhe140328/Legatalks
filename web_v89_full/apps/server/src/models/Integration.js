import mongoose from 'mongoose';

const webhookSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  url: { type: String, required: true },
  secret: { type: String, required: true },
  events: [{ type: String }],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const botRuleSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  matchType: { type: String, enum: ['contains', 'equals', 'regex'], default: 'contains' },
  pattern: { type: String, required: true },
  responseText: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const miniAppSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: String,
  icon: String,
  launchUrl: { type: String, required: true },
  allowedOrigins: [String],
  scopes: [String],
  isPublished: { type: Boolean, default: false }
}, { timestamps: true });

const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  miniApp: { type: mongoose.Schema.Types.ObjectId, ref: 'MiniApp' },
  orderId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'VND' },
  provider: { type: String, default: 'mock' },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'cancelled'], default: 'pending' },
  providerTransactionId: String,
  metadata: mongoose.Schema.Types.Mixed,
  paidAt: Date
}, { timestamps: true });

export const Webhook = mongoose.model('Webhook', webhookSchema);
export const BotRule = mongoose.model('BotRule', botRuleSchema);
export const MiniApp = mongoose.model('MiniApp', miniAppSchema);
export const Payment = mongoose.model('Payment', paymentSchema);
