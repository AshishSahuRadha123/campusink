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

  // --- ZEPTO-STYLE LIVE DELIVERY & BIKE TRACKING FIELDS ---
  deliveryType: { type: String, enum: ['Pickup', 'Delivery'], default: 'Pickup' },
  deliveryAddress: { type: String, default: '' },
  deliveryCharge: { type: Number, default: 0 },
  dropLocation: {
    lat: { type: Number, default: 19.0664 },
    lng: { type: Number, default: 72.8265 }
  },
  riderLocation: {
    lat: { type: Number, default: 19.0645 },
    lng: { type: Number, default: 72.8255 },
    updatedAt: { type: Date }
  },
  riderPhone: { type: String, default: '' },

  status: {
    type: String,
    enum: ['Pending', 'Printing', 'Ready for Pickup', 'Out for Delivery', 'Completed'],
    default: 'Pending'
  }
}, { timestamps: true });

module.exports = mongoose.model('PrintOrder', printOrderSchema);