import { Router } from "express";
import {
  registerSeller,
  listSellers,
  getMySellerProfile,
  getSellerById,
  verifySellerKYC,
  toggleSellerStatus,
  updateSellerAcquirer,
  getSellerFees,
  updateSellerFees,
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
 * @route   PATCH /api/sellers/:id/acquirer
 * @desc    Definir qual adquirente (pagarme/zendry/...) processa as transações do seller – Apenas master
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
