import express, { Router, Request, Response, NextFunction } from "express";
import {
  createTransaction,
  consultTransactionByID,
  webhookTransaction, // 🔧 Webhook interno (legacy)
} from "../controllers/transaction.controller";

import { pagarmeWebhook } from "../controllers/transaction.webhook.controller";
import { requireApprovedKyc } from "../middleware/kycGuard";
import { transactionLogger } from "../middleware/transactionLogger";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🧩 Middleware – Validação de criação de transação                          */
/* -------------------------------------------------------------------------- */
const validateCreateTransaction = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
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

  if (
    !customer ||
    typeof customer !== "object" ||
    !customer.name ||
    !customer.email ||
    !customer.document
  ) {
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
router.post(
  "/create",
  requireApprovedKyc,
  validateCreateTransaction,
  transactionLogger,
  (req: Request, res: Response): Promise<void> => createTransaction(req, res)
);

/* -------------------------------------------------------------------------- */
/* 🔍 Consultar transação por ID                                              */
/* -------------------------------------------------------------------------- */
/**
 * Retorna todos os dados da transação pelo `_id`
 * Inclui flags, retenção, status e dados de antifraude.
 */
router.get(
  "/consult",
  (req: Request, res: Response): Promise<void> => consultTransactionByID(req, res)
);

/* -------------------------------------------------------------------------- */
/* 📡 Webhook – Interno (Legacy / Sandbox)                                   */
/* -------------------------------------------------------------------------- */
/**
 * - Mantido para compatibilidade com o fluxo legado
 * - Usado em ambiente de testes e integrações locais
 */
router.post(
  "/webhook",
  (req: Request, res: Response): Promise<void> => webhookTransaction(req, res)
);

/* -------------------------------------------------------------------------- */
/* 🔔 Webhook – Pagar.me → Kissa Pagamentos                                  */
/* -------------------------------------------------------------------------- */
/**
 * - Atualiza status de transações reais processadas pela Pagar.me
 * - Valida assinatura HMAC (header `x-hub-signature`)
 * - Atualiza status → [pending, approved, failed, refunded]
 * - Gera registro de auditoria antifraude
 */
router.post(
  "/webhook/pagarme",
  (req: Request, res: Response): Promise<void> => pagarmeWebhook(req, res)
);

/* -------------------------------------------------------------------------- */
/* ⚠️ Rota fallback                                                          */
/* -------------------------------------------------------------------------- */
router.use("*", (_req, res) => {
  res.status(404).json({
    status: false,
    msg: "Rota de transação não encontrada. Verifique o endpoint.",
  });
});

export default router;
