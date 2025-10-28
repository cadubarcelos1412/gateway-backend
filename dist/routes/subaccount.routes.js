"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/subaccount.routes.ts
const express_1 = require("express");
const subaccount_model_1 = require("../models/subaccount.model");
const auth_1 = require("../config/auth");
const router = (0, express_1.Router)();
/**
 * @route GET /api/subaccounts/me
 * @desc  Ver a subconta do seller logado
 * @access Autenticado
 */
router.get("/me", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        if (!token) {
            res.status(401).json({ status: false, msg: "Token ausente." });
            return;
        }
        const payload = await (0, auth_1.decodeToken)(token);
        if (!payload?.id) {
            res.status(403).json({ status: false, msg: "Token inválido." });
            return;
        }
        const subaccount = await subaccount_model_1.Subaccount.findOne({ sellerId: payload.id }).lean();
        if (!subaccount) {
            res.status(404).json({ status: false, msg: "Subconta não encontrada." });
            return;
        }
        res.status(200).json({ status: true, subaccount });
    }
    catch (error) {
        console.error("❌ Erro ao buscar subconta:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao buscar subconta." });
    }
});
exports.default = router;
