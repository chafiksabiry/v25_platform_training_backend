import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { loginValidation, registerValidation } from '../middleware/validator';

const router = Router();

router.post('/login', loginValidation, authController.login);
router.post('/register', registerValidation, authController.register);
router.get('/me', authController.getCurrentUser);
router.post('/logout', authController.logout);

export default router;
