"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireApprovedKyc = void 0;
const auth_1 = require("../config/auth");
const seller_model_1 = require("../models/seller.model");
/**
 * 🔐 Middleware global de proteção de operações financeiras
 * - Bloqueia qualquer transação se o KYC do seller não estiver aprovado.
 * - Status permitidos: "approved" ou "active"
 * - Status bloqueados: "pending", "under_review", "rejected"
 */
const requireApprovedKyc = async (req, res, next) => {
    try {
        const rawToken = req.headers.authorization?.replace("Bearer ", "");
        if (!rawToken) {
            res.status(401).json({ status: false, msg: "Token ausente." });
            return;
        }
        const payload = await (0, auth_1.decodeToken)(rawToken);
        if (!payload || !payload.id) {
            res.status(401).json({ status: false, msg: "Token inválido." });
            return;
        }
        const seller = await seller_model_1.Seller.findOne({ userId: payload.id });
        if (!seller) {
            res.status(404).json({ status: false, msg: "Seller não encontrado." });
            return;
        }
        if (seller.kycStatus !== "approved" && seller.kycStatus !== "active") {
            res.status(403).json({
                status: false,
                msg: `❌ Operação bloqueada: KYC com status '${seller.kycStatus}'. Complete a verificação antes de operar.`,
            });
            return;
        }
        // ✅ Tudo certo, segue para a rota
        next();
    }
    catch (error) {
        console.error("💥 Erro no middleware requireApprovedKyc:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao validar KYC." });
    }
};
exports.requireApprovedKyc = requireApprovedKyc;
