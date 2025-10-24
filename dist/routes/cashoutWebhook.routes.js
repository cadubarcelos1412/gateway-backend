"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cashoutWebhook_controller_1 = require("../controllers/cashoutWebhook.controller");
const router = (0, express_1.Router)();
/**
 * @route POST /api/cashout/webhook/bank
 * @desc Recebe notificação do banco confirmando liquidação Pix/TED
 * @access Público (autenticado via assinatura HMAC no futuro)
 */
router.post("/bank", cashoutWebhook_controller_1.bankCashoutWebhook);
exports.default = router;
