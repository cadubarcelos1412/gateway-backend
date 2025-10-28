"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const score_controller_1 = require("../controllers/score.controller");
const router = (0, express_1.Router)();
/* -------------------------------------------------------------------------- */
/* 📊 ROTAS – Score de Risco                                                  */
/* -------------------------------------------------------------------------- */
/**
 * @route GET /api/score/seller/:id
 * @desc Retorna score de risco do seller
 * @access Master/Admin
 */
router.get("/seller/:id", score_controller_1.getSellerScore);
/**
 * @route GET /api/score/transaction/:id
 * @desc Retorna score de risco da transação
 * @access Master/Admin
 */
router.get("/transaction/:id", score_controller_1.getTransactionScore);
exports.default = router;
