const mongoose = require('mongoose');

const rewardSubSchema = new mongoose.Schema({
  freePages: { type: Number, required: true },
  reason: { type: String, required: true },
  minPaidPages: { type: Number, default: 10 },
  expiryDate: { type: Date, required: true },
  status: { type: String, enum: ['Active', 'Used', 'Expired'], default: 'Active' }
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  referralCode: { type: String, unique: true },
  referredBy: { type: String, default: null },
  referralRewardClaimed: { type: Boolean, default: false },
  completedOrdersCount: { type: Number, default: 0 },
  monthlyReferrals: { type: Number, default: 0 },
  lastReferralMonth: { type: String, default: '' },
  rewards: [rewardSubSchema]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);