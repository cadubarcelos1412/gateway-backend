"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const transaction_controller_1 = require("../controllers/transaction.controller");
const transaction_webhook_controller_1 = require("../controllers/transaction.webhook.controller");
const kycGuard_1 = require("../middleware/kycGuard");
const transactionLogger_1 = require("../middleware/transactionLogger");
const router = (0, express_1.Router)();
/* -------------------------------------------------------------------------- */
/* 🧩 Middleware – Validação de criação de transação                          */
/* -------------------------------------------------------------------------- */
const validateCreateTransaction = (req, res, next) => {
    const { amount, method, description, productId, customer } = req.body;
    if (!amount || typeof amount !== "number" || amount <= 0) {
        res.status(400).json({ status: false, msg: "Valor 'amount' inválido." });
        return;
    }
    if (!method || !["pix", "credit_card", "boleto"].includes(method)) {
        res.status(400).json({
            status: false,
            msg: "Método de pagamento inválido. Use: 'pix', 'credit_card' ou 'boleto'.",
        });
        return;
    }
    if (!description || typeof description !== "string" || description.trim().length < 3) {
        res.status(400).json({
            status: false,
            msg: "Campo 'description' obrigatório e deve ter pelo menos 3 caracteres.",
        });
        return;
    }
    if (!productId || typeof productId !== "string") {
        res.status(400).json({ status: false, msg: "Campo 'productId' obrigatório." });
        return;
    }
    if (!customer ||
        typeof customer !== "object" ||
        !customer.name ||
        !customer.email ||
        !customer.document) {
        res.status(400).json({
            status: false,
            msg: "Dados do comprador são obrigatórios: name, email e document.",
        });
        return;
    }
    next();
};
/* -------------------------------------------------------------------------- */
/* 💳 Criar transação real (Multiadquirente – Enterprise)                     */
/* -------------------------------------------------------------------------- */
/**
 * - Exige KYC aprovado
 * - Valida payload
 * - Loga tentativa
 * - Encaminha para adquirente correta (Pagar.me, KissaGateway, etc)
 */
router.post("/create", kycGuard_1.requireApprovedKyc, validateCreateTransaction, transactionLogger_1.transactionLogger, (req, res) => (0, transaction_controller_1.createTransaction)(req, res));
/* -------------------------------------------------------------------------- */
/* 🔍 Consultar transação por ID                                              */
/* -------------------------------------------------------------------------- */
/**
 * Retorna todos os dados da transação pelo `_id`
 * Inclui flags, retenção, status e dados de antifraude.
 */
router.get("/consult", (req, res) => (0, transaction_controller_1.consultTransactionByID)(req, res));
/* -------------------------------------------------------------------------- */
/* 📡 Webhook – Interno (Legacy / Sandbox)                                   */
/* -------------------------------------------------------------------------- */
/**
 * - Mantido para compatibilidade com o fluxo legado
 * - Usado em ambiente de testes e integrações locais
 */
router.post("/webhook", (req, res) => (0, transaction_controller_1.webhookTransaction)(req, res));
/* -------------------------------------------------------------------------- */
/* 🔔 Webhook – Pagar.me → Kissa Pagamentos                                  */
/* -------------------------------------------------------------------------- */
/**
 * - Atualiza status de transações reais processadas pela Pagar.me
 * - Valida assinatura HMAC (header `x-hub-signature`)
 * - Atualiza status → [pending, approved, failed, refunded]
 * - Gera registro de auditoria antifraude
 */
router.post("/webhook/pagarme", (req, res) => (0, transaction_webhook_controller_1.pagarmeWebhook)(req, res));
/* -------------------------------------------------------------------------- */
/* ⚠️ Rota fallback                                                          */
/* -------------------------------------------------------------------------- */
router.use("*", (_req, res) => {
    res.status(404).json({
        status: false,
        msg: "Rota de transação não encontrada. Verifique o endpoint.",
    });
});
exports.default = router;
