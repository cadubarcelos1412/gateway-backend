import { Router } from "express";
import {
  createCryptoCashoutRequest,
  listCryptoCashoutRequests,
  approveCryptoCashout,
  rejectCryptoCashout,
  updateCryptoWalletAddress,
  getCryptoRates
} from "../controllers/cryptoCashout.controller";

const router = Router();

/* -------------------------------------------------------
💸 1. Criar solicitação de saque cripto (Seller)
-------------------------------------------------------- */
router.post("/cashout", createCryptoCashoutRequest);

/* -------------------------------------------------------
📋 2. Listar saques pendentes (Admin/Master)
-------------------------------------------------------- */
router.get("/requests", listCryptoCashoutRequests);

/* -------------------------------------------------------
✅ 3. Aprovar saque cripto (Admin/Master)
-------------------------------------------------------- */
router.patch("/approve/:transactionId", approveCryptoCashout);

/* -------------------------------------------------------
❌ 4. Rejeitar saque cripto (Admin/Master)
-------------------------------------------------------- */
router.patch("/reject/:transactionId", rejectCryptoCashout);

/* -------------------------------------------------------
💳 5. Atualizar endereço da carteira cripto do usuário
-------------------------------------------------------- */
router.patch("/address", updateCryptoWalletAddress);

/* -------------------------------------------------------
📊 6. Obter taxas de conversão em tempo real
-------------------------------------------------------- */
router.get("/rates", getCryptoRates);

export default router;
