"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseBalance = void 0;
const wallet_model_1 = require("../models/wallet.model");
const auth_1 = require("../config/auth");
const releaseBalance = async (req, res) => {
    try {
        const token = req.headers.authorization;
        if (!token) {
            res.status(403).json({ status: false, msg: "Token ausente." });
            return;
        }
        const payload = await (0, auth_1.decodeToken)(token.replace("Bearer ", ""));
        if (!payload?.id) {
            res.status(403).json({ status: false, msg: "Token inválido." });
            return;
        }
        const wallet = await wallet_model_1.Wallet.findOne({ userId: payload.id });
        if (!wallet) {
            res.status(404).json({ status: false, msg: "Carteira não encontrada." });
            return;
        }
        const now = new Date();
        let releasedAmount = 0;
        // ✅ Filtra os valores já liberados
        const stillLocked = [];
        for (const entry of wallet.balance.unAvailable) {
            if (entry.availableIn <= now) {
                wallet.balance.available += entry.amount;
                releasedAmount += entry.amount;
            }
            else {
                stillLocked.push(entry);
            }
        }
        wallet.balance.unAvailable = stillLocked;
        await wallet.save();
        res.status(200).json({
            status: true,
            msg: `✅ ${releasedAmount.toFixed(2)} liberado com sucesso.`,
            balance: wallet.balance,
        });
    }
    catch (error) {
        console.error("❌ Erro em releaseBalance:", error);
        res.status(500).json({ status: false, msg: "Erro ao liberar saldo." });
    }
};
exports.releaseBalance = releaseBalance;
