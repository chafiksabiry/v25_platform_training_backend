import { Router } from 'express';
import * as uploadController from '../controllers/uploadController';
import upload from '../middleware/upload';

const router = Router();

router.post('/image', upload.single('file'), uploadController.uploadImage);
router.post('/video', upload.single('file'), uploadController.uploadVideo);
// Normal document upload route. (We ensure this runs before the alias fallback, or handled cleanly)
router.post('/document', upload.single('file'), uploadController.uploadDocument);
router.delete('/:publicId', uploadController.deleteFile);

export default router;
