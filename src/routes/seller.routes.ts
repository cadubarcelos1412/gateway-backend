import { Router } from "express";
import { 
  registerSeller, 
  listSellers, 
  getMySellerProfile, 
  getSellerById, 
  verifySellerKYC 
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

export default router;
