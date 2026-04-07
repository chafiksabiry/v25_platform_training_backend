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

const app: Application = express();

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigins.includes('*')) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
app.use('/api/ai', aiRoutes);

app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Training Platform API',
    version: '1.0.0',
    status: 'running'
  });
});

app.use(errorHandler);

export default app;
