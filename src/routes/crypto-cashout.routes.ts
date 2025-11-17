import { Router } from "express";
import {
  createCryptoCashoutRequest,
  listCryptoCashoutRequests,
  approveCryptoCashout,
  rejectCryptoCashout,
  updateCryptoWalletAddress,
  getCryptoRates,
} from "../controllers/crypto-cashout.controller";

const router = Router();

/* -------------------------------------------------------
🔐 Rotas protegidas - Saque em Cripto
-------------------------------------------------------- */

// 💸 Criar solicitação de saque em cripto (usuário autenticado)
router.post("/request", createCryptoCashoutRequest);

// 📋 Listar solicitações pendentes (admin/master)
router.get("/pending", listCryptoCashoutRequests);

// ✅ Aprovar saque (admin/master)
router.patch("/approve/:transactionId", approveCryptoCashout);

// ❌ Rejeitar saque (admin/master)
router.patch("/reject/:transactionId", rejectCryptoCashout);

// 💳 Atualizar endereço de carteira cripto
router.patch("/wallet/update", updateCryptoWalletAddress);

// 📊 Obter taxas de conversão
router.get("/rates", getCryptoRates);

export default router;