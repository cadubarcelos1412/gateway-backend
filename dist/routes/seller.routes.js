"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const seller_controller_1 = require("../controllers/seller.controller");
const router = (0, express_1.Router)();
/**
 * @route   POST /api/sellers/register
 * @desc    Registrar novo seller (PF ou PJ) + criar subconta automaticamente
 * @access  Autenticado
 */
router.post("/register", seller_controller_1.registerSeller);
/**
 * @route   GET /api/sellers
 * @desc    Listar sellers com filtros e paginação – Apenas admin/master
 * @access  Admin/Master
 */
router.get("/", seller_controller_1.listSellers);
/**
 * @route   GET /api/sellers/me
 * @desc    Ver perfil do seller logado (ocultando documentos se não for master)
 * @access  Autenticado
 */
router.get("/me", seller_controller_1.getMySellerProfile);
/**
 * @route   GET /api/sellers/:id
 * @desc    Ver perfil completo de um seller – Apenas master
 * @access  Master
 */
router.get("/:id", seller_controller_1.getSellerById);
/**
 * @route   PATCH /api/sellers/:id/verify
 * @desc    Atualizar status de KYC – Apenas master
 * @access  Master
 */
router.patch("/:id/verify", seller_controller_1.verifySellerKYC);
exports.default = router;
