import { Router } from "express";
import {
  getMe,
  getMyWallet,
  getMyTransactions,
  getMyProducts,
  getMyCheckouts,
  getMyCredentials,
  getMyFees,
  anticipateWallet,
  refundMyTransaction,
} from "../controllers/me.controller";
import { setupPin, changePin, forgotPin, resetPin } from "../controllers/pin.controller";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 👤 "Meus recursos" — dados do usuário autenticado (seller)                 */
/* Prefixo base: /api/user                                                    */
/* -------------------------------------------------------------------------- */

router.get("/me", getMe);
router.get("/wallet", getMyWallet);
router.get("/transactions", getMyTransactions);
router.post("/transactions/:id/refund", refundMyTransaction);
router.get("/products", getMyProducts);
router.get("/checkouts", getMyCheckouts);
router.get("/credentials", getMyCredentials);
router.get("/fees", getMyFees);
router.post("/wallet/anticipate", anticipateWallet);

/* 🔐 PIN de saque — autoriza os saques em Pix/USDT (cashout.routes.ts) */
router.post("/pin/setup", setupPin);
router.post("/pin/change", changePin);
router.post("/pin/forgot", forgotPin);
router.post("/pin/reset", resetPin);

export default router;
