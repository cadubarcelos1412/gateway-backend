"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const report_controller_1 = require("../controllers/report.controller");
const router = (0, express_1.Router)();
/**
 * 📊 Relatório Enterprise completo (Top Produtos, Top Sellers, etc.)
 * GET /api/reports/enterprise
 */
router.get("/enterprise", report_controller_1.getEnterpriseReport);
/**
 * 💰 Visão geral financeira (saldo disponível, retenção, projeções)
 * GET /api/reports/financial
 */
router.get("/financial", report_controller_1.getFinancialOverview);
/**
 * 🏦 Histórico de saques e liberações manuais
 * GET /api/reports/payouts
 */
router.get("/payouts", report_controller_1.getPayoutsHistory);
exports.default = router;
