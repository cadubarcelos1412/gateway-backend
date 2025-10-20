import { Router, Request, Response, NextFunction } from "express";
import {
  createTransaction,
  consultTransactionByID,
  webhookTransaction,
} from "../controllers/transaction.controller";
import { requireApprovedKyc } from "../middleware/kycGuard";
import { transactionLogger } from "../middleware/transactionLogger";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🧪 Middleware – validação de criação de transação                          */
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
    res.status(400).json({ status: false, msg: "Método de pagamento inválido. Use: 'pix', 'credit_card' ou 'boleto'." });
    return;
  }

  if (!description || typeof description !== "string" || description.trim().length < 3) {
    res.status(400).json({ status: false, msg: "Campo 'description' obrigatório e deve ter pelo menos 3 caracteres." });
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
/* 🛡️ ROTAS DE TRANSAÇÕES – PRONTAS PARA SANDBOX                              */
/* -------------------------------------------------------------------------- */

/**
 * 🧾 Criar transação real
 * - Exige KYC aprovado
 * - Valida payload
 * - Loga tentativa
 */
router.post(
  "/create",
  requireApprovedKyc,
  validateCreateTransaction,
  transactionLogger,
  async (req: Request, res: Response): Promise<void> => {
    await createTransaction(req, res);
  }
);

/**
 * 🔎 Consultar transação por ID
 * - Garante formato válido
 */
router.get(
  "/consult",
  async (req: Request, res: Response): Promise<void> => {
    await consultTransactionByID(req, res);
  }
);

/**
 * 📡 Webhook seguro
 * - Atualiza status da transação
 */
router.post(
  "/webhook",
  async (req: Request, res: Response): Promise<void> => {
    await webhookTransaction(req, res);
  }
);

export default router;
