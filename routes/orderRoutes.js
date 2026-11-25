const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PrintOrder = require('../models/PrintOrder');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage & File Filter (PDF & Excel only)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExt = /pdf|xlsx|xls|csv/;
  const extMatch = allowedExt.test(path.extname(file.originalname).toLowerCase());
  if (extMatch) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, CSV, and Excel (.xlsx, .xls) files are allowed!'));
  }
};

const upload = multer({ storage, fileFilter });

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

// Place Print Order (Customer file upload OR Admin counter online print order)
router.post('/', protect, upload.single('documentFile'), async (req, res) => {
  try {
    const {
      documentName,
      fileUrl: bodyFileUrl,
      pages,
      copies,
      printType,
      sides,
      binding,
      notes,
      paymentMode,
      selectedRewardId,
      customerName,
      phone,
      totalPrice: bodyTotalPrice
    } = req.body;

    const numPages = Math.max(1, Number(pages) || 1);
    const numCopies = Math.max(1, Number(copies) || 1);
    const cleanPrintType = printType === 'Color' ? 'Color' : 'B&W';
    const cleanSides = sides === 'Double' ? 'Double' : 'Single';
    const cleanBinding = ['Spiral', 'Hard'].includes(binding) ? binding : 'None';

    let targetCustomerId = req.user.id;

    // Agar admin counter se kisi student ke naam par order banaya ja raha hai
    if (req.user.role === 'admin' && customerName) {
      let student = null;
      if (phone) {
        student = await User.findOne({ phone: String(phone).trim() });
      }
      if (!student) {
        student = await User.findById(req.user.id);
      }
      if (student) {
        targetCustomerId = student._id;
      }
    }

    const fileUrl = req.file
      ? `https://sealed-bald-buys-signing.trycloudflare.com/uploads/${req.file.filename}`
      : (bodyFileUrl || '');

    if (!req.file && !documentName) {
      return res.status(400).json({ message: 'Please provide a document name or upload a file.' });
    }

    const user = await User.findById(req.user.id);
    const totalBillablePages = numPages * numCopies;
    let freePagesUsed = 0;

    if (selectedRewardId && user) {
      if (cleanPrintType !== 'B&W') {
        return res.status(400).json({ message: 'Free pages apply strictly to standard B&W prints only.' });
      }

      const reward = user.rewards.id(selectedRewardId);
      if (!reward || reward.status !== 'Active' || new Date(reward.expiryDate) < new Date()) {
        return res.status(400).json({ message: 'Selected reward is invalid or expired.' });
      }

      if (totalBillablePages < reward.minPaidPages) {
        return res.status(400).json({
          message: `Minimum ${reward.minPaidPages} B&W pages required to redeem this reward.`
        });
      }

      freePagesUsed = Math.min(reward.freePages, totalBillablePages);
      reward.status = 'Used';
      await user.save();
    }

    const payablePages = Math.max(0, totalBillablePages - freePagesUsed);
    const ratePerPage = cleanPrintType === 'Color' ? 5 : 1;
    const bindingCharge = cleanBinding === 'Spiral' ? 25 : cleanBinding === 'Hard' ? 60 : 0;
    const calculatedPrice = payablePages * ratePerPage + bindingCharge;
    const finalPrice =
      req.user.role === 'admin' && bodyTotalPrice !== undefined && !Number.isNaN(Number(bodyTotalPrice))
        ? Number(bodyTotalPrice)
        : calculatedPrice;

    const finalDocName =
      req.user.role === 'admin' && customerName
        ? `${documentName} (${customerName.trim()})`
        : (documentName || req.file?.originalname);

    const order = await PrintOrder.create({
      customer: targetCustomerId,
      documentName: finalDocName,
      fileUrl,
      pages: numPages,
      copies: numCopies,
      printType: cleanPrintType,
      sides: cleanSides,
      binding: cleanBinding,
      notes: notes || '',
      paymentMode: ['Cash', 'Due'].includes(paymentMode) ? paymentMode : 'UPI',
      freePagesUsed,
      totalPrice: finalPrice
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: Import CSV Orders
router.post('/import-csv', protect, adminOnly, upload.single('file'), async (req, res) => {
  try {
    let rows = [];
    if (req.body?.rows) {
      rows = typeof req.body.rows === 'string' ? JSON.parse(req.body.rows) : req.body.rows;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'No valid CSV rows found.' });
    }

    const createdOrders = [];
    for (const row of rows) {
      const docName = row['document'] || row['documentname'] || row['file'] || 'Imported_Document.pdf';
      const pages = Math.max(1, Number(row['pages']) || 1);
      const copies = Math.max(1, Number(row['copies']) || 1);
      const printType = String(row['type'] || row['printtype'] || 'B&W').toLowerCase().includes('color')
        ? 'Color'
        : 'B&W';
      const sides = String(row['sides'] || 'Single').toLowerCase().includes('double') ? 'Double' : 'Single';
      const amount = Number(String(row['amount (inr)'] || row['amount'] || row['totalprice'] || '').replace(/[^\d.]/g, ''));
      const computedAmount = Number.isFinite(amount) && amount >= 0
        ? amount
        : pages * copies * (printType === 'Color' ? 5 : 1);

      const studentLabel = row['student name'] || row['studentname'] || row['name'] || '';
      const created = await PrintOrder.create({
        customer: req.user.id,
        documentName: studentLabel ? `${docName} (${studentLabel})` : docName,
        fileUrl: '',
        pages,
        copies,
        printType,
        sides,
        freePagesUsed: Number(row['free pages used'] || row['freepagesused'] || 0) || 0,
        totalPrice: computedAmount,
        status: ['Pending', 'Printing', 'Ready for Pickup', 'Completed'].includes(row['status'])
          ? row['status']
          : 'Pending'
      });
      createdOrders.push(created);
    }

    res.status(201).json({ message: 'CSV imported successfully', count: createdOrders.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/my-orders', protect, async (req, res) => {
  const orders = await PrintOrder.find({ customer: req.user.id }).sort({ createdAt: -1 });
  res.json(orders);
});

router.get('/all', protect, adminOnly, async (req, res) => {
  const orders = await PrintOrder.find()
    .populate('customer', 'name email phone referralCode')
    .sort({ createdAt: -1 });
  res.json(orders);
});

router.get('/rewards-ledger', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: 'customer' });
    const ledger = [];

    users.forEach((u) => {
      u.rewards.forEach((r) => {
        ledger.push({
          studentName: u.name,
          phone: u.phone,
          referralCode: u.referralCode,
          freePages: r.freePages,
          reason: r.reason,
          expiryDate: r.expiryDate,
          status: r.status
        });
      });
    });

    ledger.sort((a, b) => new Date(b.expiryDate) - new Date(a.expiryDate));
    res.json(ledger);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await PrintOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const wasAlreadyCompleted = order.status === 'Completed';
    order.status = status;
    await order.save();

    if (status === 'Completed' && !wasAlreadyCompleted) {
      const student = await User.findById(order.customer);
      const totalOrderPages = order.pages * order.copies;

      if (totalOrderPages >= 100) {
        student.rewards.push({
          freePages: 15,
          reason: '100+ Pages Print Milestone',
          minPaidPages: 20,
          expiryDate: addDays(20),
          status: 'Active'
        });
      } else if (totalOrderPages >= 50) {
        student.rewards.push({
          freePages: 5,
          reason: '50+ Pages Print Milestone',
          minPaidPages: 10,
          expiryDate: addDays(15),
          status: 'Active'
        });
      }

      student.completedOrdersCount += 1;
      if (student.completedOrdersCount % 5 === 0) {
        student.rewards.push({
          freePages: 20,
          reason: `5th Order Stamp Card Bonus (#${student.completedOrdersCount})`,
          minPaidPages: 10,
          expiryDate: addDays(30),
          status: 'Active'
        });
      }

      if (student.referredBy && !student.referralRewardClaimed && totalOrderPages >= 25) {
        const referrer = await User.findOne({ referralCode: student.referredBy });
        if (referrer) {
          student.referralRewardClaimed = true;
          referrer.rewards.push({
            freePages: 10,
            reason: `Referred ${student.name}`,
            minPaidPages: 10,
            expiryDate: addDays(15),
            status: 'Active'
          });

          const currentMonth = new Date().toISOString().slice(0, 7);
          if (referrer.lastReferralMonth === currentMonth) {
            referrer.monthlyReferrals += 1;
          } else {
            referrer.lastReferralMonth = currentMonth;
            referrer.monthlyReferrals = 1;
          }

          if (referrer.monthlyReferrals === 3) {
            referrer.rewards.push({
              freePages: 30,
              reason: 'Super Referrer Bonus (3 Friends in 1 Month)',
              minPaidPages: 10,
              expiryDate: addDays(30),
              status: 'Active'
            });
          }

          await referrer.save();
        }
      }

      await student.save();
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete Print Order (Admin can delete any order; Customer can delete own order) & Uploaded File
router.delete('/:id', protect, async (req, res) => {
  try {
    const order = await PrintOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
    const currentUserId = String(req.user?._id || req.user?.id || '');
    const orderOwnerId = String(order.customer?._id || order.customer || '');
    const isOwner = Boolean(currentUserId && orderOwnerId && currentUserId === orderOwnerId);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Access denied: you can only delete your own order' });
    }

    if (order.fileUrl) {
      const filePart = order.fileUrl.split('/uploads/')[1];
      if (filePart) {
        const cleanFileName = path.basename(filePart);
        const filePath = path.join(uploadDir, cleanFileName);
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') {
            console.error('Failed to delete uploaded file:', err.message);
          }
        });
      }
    }

    await PrintOrder.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;