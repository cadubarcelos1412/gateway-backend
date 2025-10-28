"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const wallet_model_1 = require("../models/wallet.model");
const router = express_1.default.Router();
/**
 * @route POST /api/wallet/simulate-unavailable
 * @desc Simula saldo indisponível (para testes locais)
 */
router.post("/simulate-unavailable", async (req, res) => {
    try {
        const { userId, amount } = req.body;
        if (!userId || !amount) {
            res.status(400).json({ status: false, msg: "userId e amount são obrigatórios." });
            return;
        }
        const wallet = await wallet_model_1.Wallet.findOne({ userId });
        if (!wallet) {
            res.status(404).json({ status: false, msg: "Carteira não encontrada." });
            return;
        }
        wallet.balance.unAvailable.push({
            amount,
            availableIn: new Date(Date.now() - 10 * 60 * 1000), // 10 min atrás
        });
        await wallet.save();
        res.status(200).json({
            status: true,
            msg: "Saldo indisponível simulado com sucesso.",
            wallet,
        });
    }
    catch (error) {
        console.error("❌ Erro ao simular saldo indisponível:", error);
        res.status(500).json({ status: false, msg: "Erro interno." });
    }
});
exports.default = router;
