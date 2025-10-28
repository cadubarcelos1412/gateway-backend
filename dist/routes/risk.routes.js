"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const risk_controller_1 = require("../controllers/risk.controller");
const router = (0, express_1.Router)();
/* -------------------------------------------------------------------------- */
/* 🧠 ROTAS – Antifraude e Regras de Risco                                   */
/* -------------------------------------------------------------------------- */
/**
 * @route GET /api/risk/rules
 * @desc Lista regras antifraude configuradas no sistema
 * @access Master/Admin
 */
router.get("/rules", risk_controller_1.getRiskRules);
/**
 * @route POST /api/risk/event
 * @desc Dispara análise antifraude manual (ex: botão "Analisar")
 * @access Master/Admin
 */
router.post("/event", risk_controller_1.triggerRiskEvent);
exports.default = router;
