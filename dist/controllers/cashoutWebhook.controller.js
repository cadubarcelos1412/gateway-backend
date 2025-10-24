"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bankCashoutWebhook = void 0;
const cashoutWebhook_service_1 = require("../services/cashoutWebhook.service");
const bankCashoutWebhook = async (req, res) => {
    try {
        const event = req.body;
        // 🔒 Validação mínima do payload
        if (!event?.cashoutId || !event?.amount) {
            res.status(400).json({ status: false, msg: "Payload inválido." });
            return;
        }
        // (opcional futuramente: validar assinatura do banco via HMAC)
        // validateBankSignature(req.headers["x-bank-signature"], event);
        await cashoutWebhook_service_1.CashoutWebhookService.processBankWebhook(event);
        res.status(200).json({ status: true, msg: "✅ Webhook processado com sucesso." });
    }
    catch (error) {
        console.error("❌ Erro no webhook bancário:", error);
        res.status(500).json({ status: false, msg: error.message || "Erro interno." });
    }
};
exports.bankCashoutWebhook = bankCashoutWebhook;
