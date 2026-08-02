import { Request, Response } from 'express';
import mongoose from 'mongoose';

export const healthCheck = (req: Request, res: Response): void => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  };

  res.status(200).json(health);
};

export const corsTest = (req: Request, res: Response): void => {
  res.status(200).json({
    message: 'CORS is working',
    origin: req.headers.origin,
    method: req.method
  });
};
