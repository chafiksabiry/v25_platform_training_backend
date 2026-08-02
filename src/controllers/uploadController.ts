import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import cloudinaryService from '../services/cloudinaryService';
import { uploadMulterFileToGCS } from '../services/gcsService';

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
  const folder = (req.body.folder || 'trainings/documents').replace(/\//g, '-');
  
  // Try GCS first (more reliable than Cloudinary on this service)
  if (process.env.CLOUD_STORAGE_CREDENTIALS) {
    try {
      const result = await uploadMulterFileToGCS(req.file, folder);
      return res.status(200).json({ success: true, url: result.url, secureUrl: result.url, publicId: result.publicId });
    } catch (gcsError: any) {
      console.warn('⚠️ GCS upload failed, falling back to Cloudinary:', gcsError?.message);
    }
  }
  
  // Fallback: Cloudinary
  try {
    const result = await cloudinaryService.uploadDocument(req.file, folder);
    return res.status(200).json({ success: true, ...result });
  } catch (uploadError: any) {
    const isAuthError = uploadError?.http_code === 401 || uploadError?.message?.includes('disabled') || uploadError?.message?.includes('invalid');
    if (isAuthError) {
      console.warn('⚠️ Cloudinary also unavailable:', uploadError?.message);
      return res.status(200).json({ success: false, url: '', secureUrl: '', publicId: '', error: 'All storage providers unavailable' });
    }
    throw uploadError;
  }
});

export const deleteFile = asyncHandler(async (req: Request, res: Response) => {
  const publicId = req.params.publicId;
  await cloudinaryService.deleteFile(publicId);
  return res.status(200).json({ success: true, message: 'File deleted successfully' });
});
