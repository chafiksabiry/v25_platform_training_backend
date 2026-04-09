import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import cloudinaryService from '../services/cloudinaryService';

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  const folder = req.body.folder || 'trainings/images';
  const result = await cloudinaryService.uploadImage(req.file, folder);
  return res.status(200).json({ success: true, ...result });
});

export const uploadVideo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  const folder = req.body.folder || 'trainings/videos';
  const result = await cloudinaryService.uploadVideo(req.file, folder);
  return res.status(200).json({ success: true, ...result });
});

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }
  const folder = req.body.folder || 'trainings/documents';
  try {
    const result = await cloudinaryService.uploadDocument(req.file, folder);
    return res.status(200).json({ success: true, ...result });
  } catch (uploadError: any) {
    // Cloudinary account may be disabled or credentials invalid
    const isAuthError = uploadError?.http_code === 401 || uploadError?.message?.includes('disabled') || uploadError?.message?.includes('invalid');
    if (isAuthError) {
      console.warn('⚠️ Cloudinary upload skipped (auth error):', uploadError?.message);
      // Return graceful response so frontend doesn't crash
      return res.status(200).json({ success: false, url: '', secureUrl: '', publicId: '', error: 'Cloudinary unavailable' });
    }
    throw uploadError; // Re-throw other errors
  }
});

export const deleteFile = asyncHandler(async (req: Request, res: Response) => {
  const publicId = req.params.publicId;
  await cloudinaryService.deleteFile(publicId);
  return res.status(200).json({ success: true, message: 'File deleted successfully' });
});
