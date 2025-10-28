"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const kyc_controller_1 = require("../controllers/kyc.controller");
const router = (0, express_1.Router)();
/**
 * 🔍 GET /api/kyc/list
 * Lista todos os KYCs (pode ser protegida ou não)
 */
router.get("/list", kyc_controller_1.getAllKYCs);
/**
 * 📊 GET /api/kyc/stats
 * Estatísticas de KYC
 */
router.get("/stats", kyc_controller_1.getKYCStats);
/**
 * ✏️ PUT /api/kyc/update
 * Atualizar status de KYC
 */
router.put("/update", kyc_controller_1.updateKYC);
/**
 * 📤 POST /api/kyc/upload
 * Upload de documentos KYC
 */
router.post("/upload", kyc_controller_1.uploadKYCDocuments);
exports.default = router;
