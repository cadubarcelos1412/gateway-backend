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
} from "../controllers/me.controller";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 👤 "Meus recursos" — dados do usuário autenticado (seller)                 */
/* Prefixo base: /api/user                                                    */
/* -------------------------------------------------------------------------- */

router.get("/me", getMe);
router.get("/wallet", getMyWallet);
router.get("/transactions", getMyTransactions);
router.get("/products", getMyProducts);
router.get("/checkouts", getMyCheckouts);
router.get("/credentials", getMyCredentials);
router.get("/fees", getMyFees);
router.post("/wallet/anticipate", anticipateWallet);

export default router;
