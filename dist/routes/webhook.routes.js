"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const transaction_webhook_controller_1 = require("../controllers/transaction.webhook.controller");
const router = (0, express_1.Router)();
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
router.post('/pagarme', transaction_webhook_controller_1.pagarmeWebhook);
// Alias para compatibilidade
router.post('/transactions/webhook', transaction_webhook_controller_1.pagarmeWebhook);
exports.default = router;
