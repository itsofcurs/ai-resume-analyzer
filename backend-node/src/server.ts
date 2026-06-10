import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import mongoose from 'mongoose';
import authRoutes from './routes/auth';
import resumeRoutes from './routes/resumes';
import copilotRoutes from './routes/copilot';
import jobsRoutes from './routes/jobs';
import interviewRoutes from './routes/interview';
import fraudRoutes from './routes/fraud';
import skillgapRoutes from './routes/skillgap';
import predictiveRoutes from './routes/predictive';
import analyticsRoutes from './routes/analytics';
import memoryRoutes from './routes/memory';
import skillgraphRoutes from './routes/skillgraph';
import successRoutes from './routes/success';
import skillsRoutes from './routes/skills';
import knowledgeGraphRoutes from './routes/knowledgeGraph';
import mediaRoutes from './routes/media';
import pipelineRoutes from './routes/pipeline';
import scorecardsRoutes from './routes/scorecards';
import forecastRoutes from './routes/forecast';
import auditRoutes from './routes/audit';
import costRoutes from './routes/cost';
import searchRoutes from './routes/search';
import operationsRoutes from './routes/operations';
import path from 'path';
import { requestContextMiddleware, requestContext } from './middleware/requestContext';
import { regionRoutingMiddleware } from './middleware/regionRouting';
import { startWorkers } from './workers';
import billingRouter, { webhookHandler } from './routes/billing';
import axios from 'axios';

// Global Axios Interceptor for Correlation ID
axios.interceptors.request.use((config) => {
  const store = requestContext.getStore();
  if (store) {
    const correlationId = store.get('correlationId');
    if (correlationId) {
      config.headers['x-correlation-id'] = correlationId;
    }
  }
  return config;
});

dotenv.config();

// Phase 5A: Start background workers
if (process.env.NODE_ENV !== 'test') {
  startWorkers();
}

export const app = express();
app.set("trust proxy", 1); // Trust first proxy (Render/Vercel)
const httpServer = createServer(app);
// Dynamic CORS: allow all Vercel preview/production domains + localhost
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL || '',
].filter(Boolean);

function corsOriginCheck(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  // Allow requests with no origin (server-to-server, mobile apps, curl)
  if (!origin) return callback(null, true);
  // Allow any vercel.app subdomain
  if (origin.endsWith('.vercel.app')) return callback(null, true);
  // Allow explicit origins
  if (allowedOrigins.includes(origin)) return callback(null, true);
  // Allow localhost with any port
  if (origin.startsWith('http://localhost:')) return callback(null, true);
  callback(null, false);
}

export const io = new Server(httpServer, {
  cors: { origin: corsOriginCheck }
});

export const prisma = new PrismaClient();

// Initialize Redis Client
if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
  console.error("FATAL: REDIS_URL is strictly required in production.");
  process.exit(1);
}

export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

app.use(helmet());
app.use(cors({ origin: corsOriginCheck, credentials: true }));

// Stripe webhook MUST be raw
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json());

// Phase 5A: Telemetry & Observability
app.use(requestContextMiddleware);

// Phase 5A: Multi-Region Architecture
app.use(regionRoutingMiddleware);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

const userRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    return req.user?.id || req.ip;
  }
});

// Routes
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/copilot', userRateLimiter, copilotRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/fraud', fraudRoutes);
app.use('/api/skill-gap', skillgapRoutes);
app.use('/api/predictive-hiring', predictiveRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/skill-graph', skillgraphRoutes);
app.use('/api/success', successRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/graph', knowledgeGraphRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/scorecards', scorecardsRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/cost', costRoutes);
app.use('/api/billing', userRateLimiter, billingRouter);
app.use('/api/memory', userRateLimiter, memoryRoutes);
app.use('/api/operations', operationsRoutes);

// Internal endpoint for Python to report timeouts
app.post('/api/internal/timeout', express.json(), async (req, res) => {
  const { workflow, organizationId, duration, status } = req.body;
  try {
    await prisma.auditLog.create({
      data: {
        userId: 'system',
        organizationId: organizationId || 'system',
        action: 'workflow_timeout',
        resource: workflow,
        afterState: { duration, status }
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log timeout' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: "AI Hiring Intelligence Backend is LIVE", status: "ok" });
});

// Phase 5A: Health Monitoring
app.get('/live', (req, res) => {
  res.json({ status: "ok" });
});

app.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (mongoose.connection.readyState !== 1 && process.env.MONGODB_URI) {
      throw new Error('MongoDB not ready');
    }
    await redisClient.ping();
    res.json({ status: "ok" });
  } catch (error: any) {
    res.status(503).json({ status: "error", detail: error.message });
  }
});

app.get('/health', async (req, res) => {
  let prismaUp = "up", mongoUp = "up", redisUp = "up";
  try { await prisma.$queryRaw`SELECT 1`; } catch { prismaUp = "down"; }
  if (process.env.MONGODB_URI && mongoose.connection.readyState !== 1) { mongoUp = "down"; }
  try { await redisClient.ping(); } catch { redisUp = "down"; }
  
  const isHealthy = prismaUp === "up" && mongoUp === "up" && redisUp === "up";
  res.status(isHealthy ? 200 : 503).json({
    prisma: prismaUp,
    mongo: mongoUp,
    redis: redisUp,
    uptime: process.uptime()
  });
});

// Socket.IO Authentication Middleware
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    socket.data.user = decoded;
    socket.data.organizationId = decoded.organizationId;
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id} (Org: ${socket.data.organizationId})`);
  
  if (socket.data.organizationId) {
    socket.join(socket.data.organizationId);
    console.log(`Socket ${socket.id} joined room ${socket.data.organizationId}`);
  }
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Connect to MongoDB
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB');
    } else {
      console.warn('MONGODB_URI not found in environment');
    }

    // Connect to PostgreSQL via Prisma
    await prisma.$connect();
    console.log('Connected to PostgreSQL via Prisma');

    // Connect to Redis
    await redisClient.connect();
    console.log('Connected to Redis');

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}
