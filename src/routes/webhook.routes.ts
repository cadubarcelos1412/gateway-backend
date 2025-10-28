import { Router } from 'express';
import { pagarmeWebhook } from '../controllers/transaction.webhook.controller';

const router = Router();

/**
 * @swagger
 * /api/webhooks/pagarme:
 *   post:
 *     summary: Webhook da Pagar.me v5
 *     tags: [Webhooks]
 *     responses:
 *       200:
 *         description: Webhook processado
 */
router.post('/pagarme', pagarmeWebhook);

// Alias para compatibilidade
router.post('/transactions/webhook', pagarmeWebhook);

export default router;