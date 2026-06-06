import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
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
import path from 'path';

dotenv.config();

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
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Routes
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/copilot', copilotRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/fraud', fraudRoutes);
app.use('/api/skill-gap', skillgapRoutes);

app.get('/', (req, res) => {
  res.json({ message: "AI Hiring Intelligence Backend is LIVE", status: "ok" });
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
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
