import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import authService from '../services/authService';
import { asyncHandler } from '../middleware/errorHandler';

export const login = asyncHandler(async (req: AuthRequest, res: Response) => {
  const response = await authService.login(req.body);
  res.status(200).json(response);
});

export const register = asyncHandler(async (req: AuthRequest, res: Response) => {
  const response = await authService.register(req.body);
  res.status(201).json(response);
});

export const getCurrentUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const user = await authService.getCurrentUser(req.user.email);
  res.status(200).json(user);
});

export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.status(200).json({ message: 'Logged out successfully' });
});
