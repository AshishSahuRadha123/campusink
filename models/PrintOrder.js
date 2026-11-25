const mongoose = require('mongoose');

const printOrderSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  documentName: { type: String, required: true },
  fileUrl: { type: String, default: '' },
  pages: { type: Number, required: true },
  copies: { type: Number, default: 1 },
  printType: { type: String, enum: ['B&W', 'Color'], default: 'B&W' },
  sides: { type: String, enum: ['Single', 'Double'], default: 'Single' },
  binding: { type: String, enum: ['None', 'Spiral', 'Hard'], default: 'None' },
  notes: { type: String, default: '' },
  paymentMode: { type: String, enum: ['UPI', 'Cash', 'Due'], default: 'UPI' },
  freePagesUsed: { type: Number, default: 0 },
  totalPrice: { type: Number, required: true },
  status: {
    type: String,
    enum: ['Pending', 'Printing', 'Ready for Pickup', 'Completed'],
    default: 'Pending'
  }
}, { timestamps: true });

module.exports = mongoose.model('PrintOrder', printOrderSchema);