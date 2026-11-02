// server.js - Main entry point for the AI DJ Studio backend

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { createStructuredRequestLogger } = require('./middleware/structuredRequestLogger');
const { createHealthHandlers } = require('./controllers/healthController');
const { resolveExpiredBattles } = require('./services/soundclashService');

// Load environment variables
dotenv.config();

// Connect to MongoDB
const databaseReady = connectDB();

const allowedClientOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = {
  origin: allowedClientOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  exposedHeaders: ['X-Request-ID', 'X-Correlation-ID'],
};

const app = express();
const server = http.createServer(app);

// Setup Socket.io with CORS
const io = socketIo(server, {
  cors: corsOptions,
});

// Make io accessible to routes and controllers
app.set('io', io);

// Middleware
app.use(cors(corsOptions));
app.use(express.json()); // Parse JSON request bodies
app.use(createStructuredRequestLogger());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { dotfiles: 'deny' }));

// --- API Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tracks', require('./routes/tracks'));
app.use('/api/lounges', require('./routes/lounges'));
app.use('/api/queue', require('./routes/queue'));
app.use('/api/soundclash', require('./routes/soundclash'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/aidj', require('./routes/aiDj'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/recommendations', require('./routes/recommendations'));

// Health check route
const { apiHealth, queueGatewayHealth } = createHealthHandlers({ mongoose, server, io });
app.get('/', (req, res) => {
  res.json({ message: 'AI DJ Studio API is running!' });
});
app.get('/health', apiHealth);
app.get('/health/queue-gateway', queueGatewayHealth);

// Error handler (must be last middleware)
app.use(errorHandler);

// --- Socket.io Setup ---
const socketHandler = require('./socket/socketHandler');
socketHandler(io);

databaseReady.then(() => {
  const resolveExpired = () => {
    resolveExpiredBattles(io).catch((error) => {
      console.error('Soundclash scheduler failed:', error.message);
    });
  };
  resolveExpired();
  const scheduler = setInterval(resolveExpired, 5000);
  scheduler.unref();
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🎵 AI DJ Studio Server running on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
