import { Router } from "express";
import {
  createCashoutRequest,
  listCashoutRequests,
  updateCashoutStatus,
  releaseBalanceManually,
} from "../controllers/cashout.controller";

const router = Router();

/* ----------------------- 🏦 Rotas de Solicitação de Saque ----------------------- */

/**
 * @route POST /api/cashout/request
 * @desc Criar uma nova solicitação de saque (seller)
 * @access Protegido (precisa de token JWT)
 */
router.post("/request", createCashoutRequest);

/**
 * @route GET /api/cashout/list
 * @desc Listar todas as solicitações de saque pendentes (admin/master)
 * @access Protegido
 */
router.get("/list", listCashoutRequests);

/**
 * @route PATCH /api/cashout/release/:userId
 * @desc Liberar TODO saldo indisponível manualmente para um usuário (somente admin/master)
 * @access Protegido
 */
router.patch("/release/:userId", releaseBalanceManually);

/**
 * @route PATCH /api/cashout/:id
 * @desc Aprovar ou rejeitar uma solicitação específica de saque (admin/master)
 * @access Protegido
 */
router.patch("/:id", updateCashoutStatus); // ⚠️ manter por último

export default router;
