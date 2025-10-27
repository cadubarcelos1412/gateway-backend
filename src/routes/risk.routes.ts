import { Router } from "express";
import { getRiskRules, triggerRiskEvent } from "../controllers/risk.controller";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🧠 ROTAS – Antifraude e Regras de Risco                                   */
/* -------------------------------------------------------------------------- */

/**
 * @route GET /api/risk/rules
 * @desc Lista regras antifraude configuradas no sistema
 * @access Master/Admin
 */
router.get("/rules", getRiskRules);

/**
 * @route POST /api/risk/event
 * @desc Dispara análise antifraude manual (ex: botão "Analisar")
 * @access Master/Admin
 */
router.post("/event", triggerRiskEvent);

export default router;
