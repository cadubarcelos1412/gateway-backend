import { Router } from "express";
import {
  registerSeller,
  listSellers,
  getMySellerProfile,
  getSellerById,
  verifySellerKYC,
  toggleSellerStatus,
  toggleAutoWithdraw,
  toggleWireEnabled,
  togglePixPhoneOnly,
  getSellerAcquirerConfig,
  updateSellerAcquirerConfig,
  getSellerFees,
  updateSellerFees,
  listMySplitRules,
  listReceivedSplitRules,
  createSplitRule,
  updateSplitRulePercentage,
  respondSplitRule,
  revokeSplitRule,
} from "../controllers/seller.controller";

const router = Router();

/**
 * @route   POST /api/sellers/register
 * @desc    Registrar novo seller (PF ou PJ) + criar subconta automaticamente
 * @access  Autenticado
 */
router.post("/register", registerSeller);

/**
 * @route   GET /api/sellers
 * @desc    Listar sellers com filtros e paginação – Apenas admin/master
 * @access  Admin/Master
 */
router.get("/", listSellers);

/**
 * @route   GET /api/sellers/me
 * @desc    Ver perfil do seller logado (ocultando documentos se não for master)
 * @access  Autenticado
 */
router.get("/me", getMySellerProfile);

/**
 * @route   GET/POST /api/sellers/me/split-rules
 * @desc    Listar/criar parcerias de split (o seller logado é o pagador) —
 *          destinatário precisa já ser um seller com KYC aprovado
 * @access  Autenticado (seller)
 */
router.get("/me/split-rules", listMySplitRules);
router.post("/me/split-rules", createSplitRule);

/**
 * @route   GET /api/sellers/me/split-rules/received
 * @desc    Listar parcerias em que o seller logado é o destinatário (outro
 *          seller o convidou e roteia % das vendas dele pra cá)
 * @access  Autenticado (seller)
 */
router.get("/me/split-rules/received", listReceivedSplitRules);

/**
 * @route   PATCH /api/sellers/me/split-rules/:id/percentage
 * @desc    Propõe novo percentual pra uma parceria já ativa — não precisa
 *          cancelar o convite. Fica valendo o percentual ATUAL até o
 *          destinatário aceitar a proposta. Só o pagador pode propor.
 * @access  Autenticado (seller)
 */
router.patch("/me/split-rules/:id/percentage", updateSplitRulePercentage);

/**
 * @route   PATCH /api/sellers/me/split-rules/:id/respond
 * @desc    Aceitar ({accept:true}) ou recusar ({accept:false}) um convite de
 *          parceria OU uma proposta de mudança de percentual — só o
 *          destinatário pode responder
 * @access  Autenticado (seller)
 */
router.patch("/me/split-rules/:id/respond", respondSplitRule);

/**
 * @route   DELETE /api/sellers/me/split-rules/:id
 * @desc    Revogar uma parceria própria
 * @access  Autenticado (seller)
 */
router.delete("/me/split-rules/:id", revokeSplitRule);

/**
 * @route   GET /api/sellers/:id
 * @desc    Ver perfil completo de um seller – Apenas master
 * @access  Master
 */
router.get("/:id", getSellerById);

/**
 * @route   PATCH /api/sellers/:id/verify
 * @desc    Atualizar status de KYC – Apenas master
 * @access  Master
 */
router.patch("/:id/verify", verifySellerKYC);

/**
 * @route   PATCH /api/sellers/:id/toggle-status
 * @desc    Bloquear/desbloquear seller (independente do KYC) – Apenas master
 * @access  Master
 */
router.patch("/:id/toggle-status", toggleSellerStatus);

/**
 * @route   PATCH /api/sellers/:id/toggle-auto-withdraw
 * @desc    Liga/desliga saque PIX automático (sem aprovação manual) – Apenas master
 * @access  Master
 */
router.patch("/:id/toggle-auto-withdraw", toggleAutoWithdraw);

/**
 * @route   PATCH /api/sellers/:id/wire-enabled
 * @desc    Libera/bloqueia pedido de wire internacional (SWIFT via Sttart) – Apenas master
 * @access  Master
 */
router.patch("/:id/wire-enabled", toggleWireEnabled);

/**
 * @route   PATCH /api/sellers/:id/pix-phone-only
 * @desc    Libera/bloqueia cobrança Pix com só nome+telefone (sem email/document) – Apenas master
 * @access  Master
 */
router.patch("/:id/pix-phone-only", togglePixPhoneOnly);

/**
 * @route   GET /api/sellers/:id/acquirer-config
 * @desc    Adquirente por método (Pix/cartão/swap) — valor já resolvido
 *          (aplica fallback pro campo antigo) – Apenas master
 * @access  Master
 */
router.get("/:id/acquirer-config", getSellerAcquirerConfig);

/**
 * @route   PATCH /api/sellers/:id/acquirer-config
 * @desc    Define a adquirente por método (Pix/cartão/swap), atualização
 *          parcial — substitui o antigo /:id/acquirer (campo único) – Apenas master
 * @access  Master
 */
router.patch("/:id/acquirer-config", updateSellerAcquirerConfig);

/**
 * @route   GET/PATCH /api/sellers/:id/fees
 * @desc    Ver/editar a tabela de taxas individual do seller (pix, cartão por
 *          bandeira/parcela, liquidação, antecipação) – Apenas master
 * @access  Master
 */
router.get("/:id/fees", getSellerFees);
router.patch("/:id/fees", updateSellerFees);

export default router;
