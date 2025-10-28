import { Router } from 'express';
import { createPixPayment } from '../controllers/payment.controller';

const router = Router();

// POST /api/payments/pix
router.post('/pix', createPixPayment);

export default router;