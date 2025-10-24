"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const master_controller_1 = require("../controllers/master.controller");
const cache_1 = require("../middleware/cache");
const router = (0, express_1.Router)();
/**
 * 🔑 POST /api/master/auth
 * Gera token master a partir do SECRET_TOKEN
 */
router.post("/auth", master_controller_1.generateMasterToken);
/**
 * ✅ POST /api/master/validate
 * Valida se o token tem permissão master
 */
router.post("/validate", master_controller_1.validateMasterToken);
/**
 * 📈 GET /api/master/kpas
 * Retorna KPIs do sistema
 */
router.get("/kpas", (0, cache_1.cacheMiddleware)(30), master_controller_1.getKpas);
/**
 * 🏆 GET /api/master/top-products
 * Top 10 produtos mais vendidos
 */
router.get("/top-products", (0, cache_1.cacheMiddleware)(60), master_controller_1.getMostSaleProducts);
exports.default = router;
