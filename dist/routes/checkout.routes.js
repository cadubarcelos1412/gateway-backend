"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const checkout_controller_1 = require("../controllers/checkout.controller");
const checkout_preview_1 = require("../controllers/checkout.preview");
const checkout_pay_controller_1 = require("../controllers/checkout.pay.controller");
const router = (0, express_1.Router)();
/**
 * 🛒 Criar novo checkout
 * @route POST /api/checkout/create
 */
router.post("/create", checkout_controller_1.createCheckout);
/**
 * 🔐 Obter checkout autenticado (precisa de token)
 * @route GET /api/checkout
 */
router.get("/", checkout_controller_1.getCheckout);
/**
 * 🌐 Obter checkout público (sem token)
 * @route GET /api/checkout/public?id=...
 */
router.get("/public", checkout_controller_1.getPublicCheckout);
/**
 * 🔄 Atualizar checkout
 * @route PATCH /api/checkout
 */
router.patch("/", checkout_controller_1.updateCheckout);
/**
 * ❌ Deletar checkout
 * @route DELETE /api/checkout
 */
router.delete("/", checkout_controller_1.deleteCheckout);
/**
 * 👁️ Pré-visualizar checkout
 * @route GET /api/checkout/preview
 */
router.get("/preview", checkout_preview_1.renderCheckoutPreview);
/**
 * 💳 Realizar pagamento de um checkout
 * @route POST /api/checkout/pay
 */
router.post("/pay", checkout_pay_controller_1.payCheckout);
exports.default = router;
