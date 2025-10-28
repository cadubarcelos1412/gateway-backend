"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const master_controller_1 = require("../controllers/master.controller");
const cache_1 = require("../middleware/cache");
const MasterAuth_1 = require("../middleware/MasterAuth");
const kyc_controller_1 = require("../controllers/kyc.controller");
const router = (0, express_1.Router)();
/* -------------------------------------------------------------------------- */
/* 🔓 ROTAS PÚBLICAS                                                         */
/* -------------------------------------------------------------------------- */
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
/* -------------------------------------------------------------------------- */
/* 🔐 ROTAS PROTEGIDAS (TOKEN MASTER OBRIGATÓRIO)                             */
/* -------------------------------------------------------------------------- */
/**
 * 📈 POST /api/master/kpas
 * Retorna KPIs do sistema
 */
router.post("/kpas", MasterAuth_1.verifyMasterToken, (0, cache_1.cacheMiddleware)(30), master_controller_1.getKpas);
/**
 * 🏆 GET /api/master/top
 * Top 10 produtos mais vendidos
 */
router.get("/top", MasterAuth_1.verifyMasterToken, (0, cache_1.cacheMiddleware)(60), master_controller_1.getMostSaleProducts);
/**
 * 👥 GET /api/master/users
 * Lista todos os usuários
 */
router.get("/users", MasterAuth_1.verifyMasterToken, master_controller_1.getAllUsers);
/**
 * 💳 POST /api/master/transactions
 * Lista todas as transações
 */
router.post("/transactions", MasterAuth_1.verifyMasterToken, master_controller_1.getAllTransactions);
/**
 * 📜 POST /api/master/last-transactions
 * Últimas 10 transações
 */
router.post("/last-transactions", MasterAuth_1.verifyMasterToken, master_controller_1.getLastTransactions);
/**
 * 🔍 POST /api/master/kycs
 * Lista todos os KYCs pendentes/aprovados/rejeitados
 */
router.post("/kycs", MasterAuth_1.verifyMasterToken, kyc_controller_1.getAllKYCs);
/**
 * ✏️ POST /api/master/kyc/update
 * Atualiza status de um KYC
 */
router.post("/kyc/update", MasterAuth_1.verifyMasterToken, kyc_controller_1.updateKYC);
/**
 * ✏️ POST /api/master/user/update
 * Atualiza dados de um usuário
 */
router.post("/user/update", MasterAuth_1.verifyMasterToken, master_controller_1.updateUser);
/**
 * 💼 POST /api/master/seller/config
 * Atualiza adquirente, taxas e reserva de um seller
 */
router.post("/seller/config", MasterAuth_1.verifyMasterToken, master_controller_1.updateSellerConfig);
/**
 * ✅ POST /api/master/withdrawal/accept
 * Aprova um saque pendente
 */
router.post("/withdrawal/accept", MasterAuth_1.verifyMasterToken, master_controller_1.approveWithdrawal);
/**
 * ❌ POST /api/master/withdrawal/decline
 * Rejeita um saque pendente
 */
router.post("/withdrawal/decline", MasterAuth_1.verifyMasterToken, master_controller_1.declineWithdrawal);
exports.default = router;
