// src/routes/transaction.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import {
  createTransaction,
  consultTransactionByID,
  webhookTransaction,
} from "../controllers/transaction.controller";
import { zendryWebhook } from "../controllers/zendryWebhook.controller";
import { sttartWebhook } from "../controllers/sttartWebhook.controller";
import { requireApprovedKyc } from "../middleware/kycGuard";
import { transactionLogger } from "../middleware/transactionLogger";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🧪 Middleware – Validação de criação de transação                          */
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

  if (
    !description ||
    typeof description !== "string" ||
    description.trim().length < 3
  ) {
    res.status(400).json({
      status: false,
      msg: "Campo 'description' obrigatório e deve ter pelo menos 3 caracteres.",
    });
    return;
  }

  if (!productId || typeof productId !== "string") {
    res
      .status(400)
      .json({ status: false, msg: "Campo 'productId' obrigatório." });
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
/* 🧾 Criar transação real (multiadquirente)                                  */
/* -------------------------------------------------------------------------- */
/**
 * - Exige KYC aprovado
 * - Valida payload
 * - Loga tentativa
 * - Encaminha para a adquirente (Pagar.me)
 */
router.post(
  "/create",
  requireApprovedKyc,
  validateCreateTransaction,
  transactionLogger,
  (req: Request, res: Response): Promise<void> => createTransaction(req, res)
);

/* -------------------------------------------------------------------------- */
/* 🔎 Consultar transação por ID                                              */
/* -------------------------------------------------------------------------- */
/**
 * - Retorna todos os dados da transação pelo `_id`
 * - Inclui flags, retenção e purchaseData
 */
router.get(
  "/consult",
  (req: Request, res: Response): Promise<void> => consultTransactionByID(req, res)
);

/* -------------------------------------------------------------------------- */
/* 📡 Webhook – Pagar.me                                                      */
/* -------------------------------------------------------------------------- */
/**
 * - Atualiza status da transação com base no externalId
 * - Exige assinatura HMAC válida (`x-hub-signature`)
 */
router.post(
  "/webhook",
  (req: Request, res: Response): Promise<void> => webhookTransaction(req, res)
);

/* -------------------------------------------------------------------------- */
/* 📡 Webhook – Zendry (Pix + Cartão)                                         */
/* -------------------------------------------------------------------------- */
/**
 * - Atualiza status da transação com base no externalId (reference_code/muid)
 * - Aceita `?key=` (ZENDRY_WEBHOOK_SECRET, legado) OU assinatura HMAC-SHA256
 *   num header (ZENDRY_HMAC_WEBHOOK_SECRET, painel novo) — ver
 *   zendryWebhook.controller.ts
 */
router.post(
  "/webhook/zendry",
  (req: Request, res: Response): Promise<void> => zendryWebhook(req, res)
);

/* -------------------------------------------------------------------------- */
/* 📡 Webhook – Sttart (Pix cash-in)                                          */
/* -------------------------------------------------------------------------- */
/**
 * - Atualiza status da transação com base no externalId (txid)
 * - Exige assinatura HMAC-SHA256 (STTART_WEBHOOK_SECRET) — ver
 *   sttartWebhook.controller.ts
 */
router.post(
  "/webhook/sttart",
  (req: Request, res: Response): Promise<void> => sttartWebhook(req, res)
);

export default router;
