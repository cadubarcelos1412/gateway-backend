import { Router } from "express";
import {
  createCashoutRequest,
  createCryptoCashoutRequest,
  listMyCashoutRequests,
  listCashoutRequests,
  approveCashoutRequest,
  rejectCashoutRequest,
  markCashoutAsFailed,
  cancelCashoutWithoutRefund,
  recordManualCashout,
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
 * @route GET /api/cashouts/mine
 * @desc Listar os saques do próprio seller logado (Pix + USDT) — usado na
 *       "Histórico de Saques" do dashboard, ver TransfersPage.tsx.
 * @access Protegido (token JWT)
 */
router.get("/mine", listMyCashoutRequests);

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

/**
 * @route POST /api/cashouts/:id/mark-failed
 * @desc Saque "approved" que ficou travado (Zendry devolveu o dinheiro mas
 *       nunca fechou o status) — devolve o saldo pro seller manualmente.
 * @access Protegido (admin/master)
 */
router.post("/:id/mark-failed", markCashoutAsFailed);

/**
 * @route POST /api/cashouts/:id/cancel-no-refund
 * @desc Saque "approved" travado, cancelado SEM devolver saldo -- pro caso
 *       do dinheiro ser resolvido por fora (ex.: reenvio manual pela Zendry
 *       depois de um estorno). Evita duplicar o crédito pro seller.
 * @access Protegido (admin/master)
 */
router.post("/:id/cancel-no-refund", cancelCashoutWithoutRefund);

/**
 * @route POST /api/cashouts/manual
 * @desc Registrar um saque feito direto no painel da Zendry, fora do app
 *       (admin/master) — workaround enquanto a Zendry está instável, só pra
 *       manter o saldo interno batendo com o real. Ver
 *       CashoutService.recordManualWithdrawal.
 * @access Protegido (admin/master)
 */
router.post("/manual", recordManualCashout);

export default router;
