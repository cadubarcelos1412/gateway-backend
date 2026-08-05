import { Router } from "express";
import {
  createCashoutRequest,
  createCryptoCashoutRequest,
  listCashoutRequests,
  approveCashoutRequest,
  rejectCashoutRequest,
} from "../controllers/cashout.controller";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🏦 ROTAS DE CASHOUT / SAQUES                                              */
/* -------------------------------------------------------------------------- */

/**
 * @route POST /api/cashouts/request
 * @desc Criar nova solicitação de saque (seller)
 * @access Protegido (token JWT)
 */
router.post("/request", createCashoutRequest);

/**
 * @route POST /api/cashouts/request/usdt
 * @desc Criar solicitação de saque em USDT via Zendry (seller) — dispara o
 *       envio real na hora, sem aprovação manual de admin. Ver
 *       CashoutService.createCryptoCashout pras validações/limites.
 * @access Protegido (token JWT)
 */
router.post("/request/usdt", createCryptoCashoutRequest);

/**
 * @route GET /api/cashouts/list
 * @desc Listar todas as solicitações (apenas admin/master)
 * @access Protegido
 */
router.get("/list", listCashoutRequests);

/**
 * @route POST /api/cashouts/:id/approve
 * @desc Aprovar solicitação de saque específica (admin/master)
 * @access Protegido
 */
router.post("/:id/approve", approveCashoutRequest);

/**
 * @route POST /api/cashouts/:id/reject
 * @desc Rejeitar solicitação de saque específica (admin/master)
 * @access Protegido
 */
router.post("/:id/reject", rejectCashoutRequest);

export default router;
