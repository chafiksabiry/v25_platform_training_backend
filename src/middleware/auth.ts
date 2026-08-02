import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Auth disabled for this project
  req.user = {
    id: '659c1b2e3f4e5d6a7b8c9d0e', // Dummy admin ID
    email: 'admin@harx.com',
    role: 'admin'
  };
  return next();
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // Authorization disabled for this project
    return next();
  };
};
