import { Router } from "express";
import {
  registerSeller,
  listSellers,
  getMySellerProfile,
  getSellerById,
  verifySellerKYC,
  toggleSellerStatus,
  toggleAutoWithdraw,
  updateSellerAcquirer,
  getSellerFees,
  updateSellerFees,
  listMySplitRules,
  createSplitRule,
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
 * @route   PATCH /api/sellers/:id/acquirer
 * @desc    Definir qual adquirente (zendry/...) processa as transações do seller – Apenas master
 * @access  Master
 */
router.patch("/:id/acquirer", updateSellerAcquirer);

/**
 * @route   GET/PATCH /api/sellers/:id/fees
 * @desc    Ver/editar a tabela de taxas individual do seller (pix, cartão por
 *          bandeira/parcela, liquidação, antecipação) – Apenas master
 * @access  Master
 */
router.get("/:id/fees", getSellerFees);
router.patch("/:id/fees", updateSellerFees);

export default router;
