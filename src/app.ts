import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/authRoutes';
import journeyRoutes from './routes/journeyRoutes';
import healthRoutes from './routes/healthRoutes';
import aiRoutes from './routes/aiRoutes';
import uploadRoutes from './routes/uploadRoutes';
import upload from './middleware/upload';

const app: Application = express();


const allowedOrigins = [
  'https://v25.harx.ai',
  'https://v25-preprod.harx.ai',
  'https://harx25pageslinks.netlify.app',
  'https://harxv25dashboardfrontend.netlify.app',
  'https://v25-platform-training-frontend.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.includes(origin) || 
                     origin.endsWith('.harx.ai') || 
                     origin.endsWith('.netlify.app');
                     
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Anthropic-Key'],
  exposedHeaders: ['X-Chat-Session-Id']
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(compression());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static('uploads'));

app.use('/', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/journeys', journeyRoutes);
app.use('/training_journeys', journeyRoutes); // Legacy route alias
app.use('/api/training_journeys', journeyRoutes); // New consistency alias
app.use('/api/ai', aiRoutes);
app.use('/api/upload', uploadRoutes);

// Fix: Removed the legacy alias to avoid conflict with actual Cloudinary uploads

app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Training Platform API',
    version: '1.0.0',
    status: 'running'
  });
});

app.use(errorHandler);

export default app;
