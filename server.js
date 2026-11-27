require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const PrintOrder = require('./models/PrintOrder');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});

// Socket.io instance ko routes mein accessible rakhne ke liye
app.set('io', io);

app.use(cors());
app.use(express.json());

// Request Logger: Har aane wali request ko terminal mein dikhane ke liye
app.use((req, res, next) => {
  console.log(`--> [${req.method}] ${req.url}`, req.body);
  next();
});

const PORT = process.env.PORT || 5000;

// Health check & public uploaded PDF/Excel files
app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'CampusInk Backend API + Live Tracking' });
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

// --- ZEPTO-STYLE LIVE BIKE TRACKING SOCKET EVENTS ---
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Customer aur Rider dono specific order room join karenge
  socket.on('joinOrderRoom', (orderId) => {
    if (!orderId) return;
    socket.join(`order_${orderId}`);
    console.log(`Socket ${socket.id} joined room order_${orderId}`);
  });

  // Rider phone se live GPS coordinates aate hi customer ko broadcast + DB update
  socket.on('riderLocationUpdate', async ({ orderId, lat, lng }) => {
    if (!orderId || lat == null || lng == null) return;

    const payload = {
      orderId,
      lat: Number(lat),
      lng: Number(lng),
      updatedAt: new Date()
    };

    io.to(`order_${orderId}`).emit('liveBikeLocation', payload);

    try {
      await PrintOrder.findByIdAndUpdate(orderId, {
        riderLocation: {
          lat: Number(lat),
          lng: Number(lng),
          updatedAt: new Date()
        }
      });
    } catch (err) {
      console.error('Rider location DB update error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas (CampusInk)');
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server + Live Tracking running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => console.error('MongoDB Connection Error:', err.message));