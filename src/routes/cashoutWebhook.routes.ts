import { Router } from "express";
import { bankCashoutWebhook } from "../controllers/cashoutWebhook.controller";

const router = Router();

/**
 * @route POST /api/cashout/webhook/bank
 * @desc Recebe notificação do banco confirmando liquidação Pix/TED
 * @access Público (autenticado via assinatura HMAC no futuro)
 */
router.post("/bank", bankCashoutWebhook);

export default router;
