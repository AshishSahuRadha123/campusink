require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Request Logger: Har aane wali request ko terminal mein dikhane ke liye
app.use((req, res, next) => {
  console.log(`--> [${req.method}] ${req.url}`, req.body);
  next();
});

const PORT = process.env.PORT || 5000;

// Serve uploaded PDF & Excel files publicly for Admin to view/print
app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'CampusInk Backend API' });
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas (CampusInk)');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => console.error('MongoDB Connection Error:', err.message));