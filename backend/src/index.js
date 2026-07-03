require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const inboundRoutes = require('./routes/inbound');
const userRoutes = require('./routes/users');
const accessRoutes = require('./routes/access');
const { apiKeyMiddleware } = require('./middleware/apiKey');
const { correlationMiddleware } = require('./middleware/correlation');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(correlationMiddleware);   // attach correlationId to every request
app.use(apiKeyMiddleware);         // validate api_key header (except health)

// ── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/v1/inbound', inboundRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/user', accessRoutes);

// ── 404 / error handlers ────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── DB + Start ───────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/iam_poc';
const PORT = process.env.PORT || 4000;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log(`MongoDB connected: ${MONGO_URI}`);
    app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
