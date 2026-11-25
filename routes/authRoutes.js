const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role, appliedReferralCode } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const cleanFirstName = name.trim().split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '');
    const last4 = phone.slice(-4);
    let referralCode = `${cleanFirstName}${last4}`;

    const codeExists = await User.findOne({ referralCode });
    if (codeExists) {
      referralCode = `${cleanFirstName}${last4}${Math.floor(10 + Math.random() * 90)}`;
    }

    const initialRewards = [];
    let validReferrerCode = null;

    if (appliedReferralCode) {
      const referrer = await User.findOne({ referralCode: appliedReferralCode.trim().toUpperCase() });
      if (!referrer) {
        return res.status(400).json({ message: 'Invalid Referral Code' });
      }
      validReferrerCode = referrer.referralCode;
      initialRewards.push({
        freePages: 10,
        reason: `Joined via ${referrer.referralCode}`,
        minPaidPages: 25,
        expiryDate: addDays(7),
        status: 'Active'
      });
    }

    const user = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
      role: role || 'customer',
      referralCode,
      referredBy: validReferrerCode,
      rewards: initialRewards
    });

    res.status(201).json({ message: 'Registered successfully', referralCode: user.referralCode });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    let updated = false;
    user.rewards.forEach((reward) => {
      if (reward.status === 'Active' && new Date(reward.expiryDate) < now) {
        reward.status = 'Expired';
        updated = true;
      }
    });

    if (updated) await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;