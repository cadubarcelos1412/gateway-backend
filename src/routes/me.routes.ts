import { Router } from "express";
import {
  getMe,
  getMyWallet,
  getMyTransactions,
  getMySplitTransactions,
  getMyProducts,
  getMyCheckouts,
  getMyCredentials,
  getMyFees,
  anticipateWallet,
  getMyBeneficiaries,
  saveMyBeneficiary,
  deleteMyBeneficiary,
} from "../controllers/me.controller";
import { setupPin, changePin, forgotPin, resetPin } from "../controllers/pin.controller";
import { authRateLimit } from "../middleware/authRateLimit";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 👤 "Meus recursos" — dados do usuário autenticado (seller)                 */
/* Prefixo base: /api/user                                                    */
/* -------------------------------------------------------------------------- */

router.get("/me", getMe);
router.get("/wallet", getMyWallet);
router.get("/transactions", getMyTransactions);
router.get("/split-transactions", getMySplitTransactions);
router.get("/products", getMyProducts);
router.get("/checkouts", getMyCheckouts);
router.get("/credentials", getMyCredentials);
router.get("/fees", getMyFees);
router.post("/wallet/anticipate", anticipateWallet);

/* 📇 Favorecidos salvos — atalho de preenchimento no saque Pix */
router.get("/beneficiaries", getMyBeneficiaries);
router.post("/beneficiaries", saveMyBeneficiary);
router.delete("/beneficiaries/:id", deleteMyBeneficiary);

/* 🔐 PIN de saque — autoriza os saques em Pix/USDT (cashout.routes.ts) */
// 🔒 authRateLimit (achado de auditoria de segurança 2026-08-30) — PIN de
// saque não tinha limite de tentativas por IP antes.
router.post("/pin/setup", authRateLimit, setupPin);
router.post("/pin/change", authRateLimit, changePin);
router.post("/pin/forgot", authRateLimit, forgotPin);
router.post("/pin/reset", authRateLimit, resetPin);

export default router;
