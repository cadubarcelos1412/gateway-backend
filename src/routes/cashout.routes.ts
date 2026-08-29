import { Router } from "express";
import multer from "multer";
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
  createWireCashoutRequest,
  completeWireCashoutRequest,
  rejectWireCashoutRequest,
  previewWireQuoteRequest,
} from "../controllers/cashout.controller";
import { requireAuth } from "../middleware/requireAuth";
import { sensitiveActionRateLimit } from "../middleware/authRateLimit";

const router = Router();
// 🔒 Limite de tamanho + tipo de arquivo (achado de auditoria de segurança
// 2026-08-30) — antes não tinha nenhum dos dois.
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Apenas arquivos JPG, PNG ou PDF são permitidos."));
  },
});

/* -------------------------------------------------------------------------- */
/* 🏦 ROTAS DE CASHOUT / SAQUES                                              */
/* -------------------------------------------------------------------------- */

/**
 * @route POST /api/cashouts/request
 * @desc Criar nova solicitação de saque (seller)
 * @access Protegido (token JWT)
 */
// 🔒 sensitiveActionRateLimit (achado de auditoria de segurança 2026-08-30)
// — criação de saque não tinha limite nenhum antes.
router.post("/request", sensitiveActionRateLimit, createCashoutRequest);

/**
 * @route POST /api/cashouts/request/usdt
 * @desc Criar solicitação de saque em USDT via Zendry (seller) — dispara o
 *       envio real na hora, sem aprovação manual de admin. Ver
 *       CashoutService.createCryptoCashout pras validações/limites.
 * @access Protegido (token JWT)
 */
router.post("/request/usdt", sensitiveActionRateLimit, createCryptoCashoutRequest);

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

/**
 * @route POST /api/cashouts/request/wire
 * @desc Criar pedido de wire internacional (SWIFT via Sttart) — 100% manual
 *       do lado da adquirente, ver services/wireCashout.service.ts. Multipart:
 *       campo `invoice` (arquivo, opcional) + `payload` (JSON, resto dos dados).
 * @access Protegido (token JWT)
 */
router.post("/request/wire", requireAuth, sensitiveActionRateLimit, upload.single("invoice"), createWireCashoutRequest);

/**
 * @route POST /api/cashouts/quote/wire
 * @desc Só cota e calcula o teto (não cria nada, não toca no saldo) — pra
 *       a tela mostrar o valor MÁXIMO antes do seller confirmar o pedido.
 * @access Protegido (token JWT)
 */
router.post("/quote/wire", previewWireQuoteRequest);

/**
 * @route POST /api/cashouts/:id/complete-wire
 * @desc Master confirma um wire já executado manualmente no painel da
 *       Sttart — é aqui que o saldo/ledger são de fato movimentados.
 * @access Protegido (admin/master)
 */
router.post("/:id/complete-wire", completeWireCashoutRequest);

/**
 * @route POST /api/cashouts/:id/reject-wire
 * @desc Rejeita um pedido de wire ainda pendente — devolve o teto congelado
 *       integralmente pro saldo.
 * @access Protegido (admin/master)
 */
router.post("/:id/reject-wire", rejectWireCashoutRequest);

export default router;
