import express from "express";
import {
  createCashout,
  approveCashout,
  rejectCashout,
} from "../controllers/cashout.controller";

const router = express.Router();

/**
 * 💸 Rotas de Cashout (saques)
 * Protegidas — apenas master/admin pode aprovar/rejeitar.
 */

// 1️⃣ Criar solicitação de saque (seller)
router.post("/create", createCashout);

// 2️⃣ Aprovar solicitação (master/admin)
router.post("/approve", approveCashout);

// 3️⃣ Rejeitar solicitação (master/admin)
router.post("/reject", rejectCashout);

export default router;
