"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerEngine = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ledgerSnapshot_model_1 = __importDefault(require("../../models/ledger/ledgerSnapshot.model"));
const transaction_model_1 = require("../../models/transaction.model");
/**
 * 🧱 LedgerEngine (Fechamento Contábil T+0)
 * - Consolida créditos e débitos diários por seller
 * - Gera snapshot contábil para conciliação T+1
 */
class LedgerEngine {
    static async run() {
        console.log("\n📘 [LedgerEngine] Iniciando fechamento contábil T+0...");
        const today = new Date();
        const dateKey = today.toISOString().split("T")[0];
        // 🔍 Buscar transações do dia
        const txs = await transaction_model_1.Transaction.find({
            createdAt: {
                $gte: new Date(`${dateKey}T00:00:00.000Z`),
                $lte: new Date(`${dateKey}T23:59:59.999Z`),
            },
        });
        if (txs.length === 0) {
            console.warn(`⚠️ Nenhuma transação encontrada para ${dateKey}.`);
            return;
        }
        // 🧮 Agrupar transações por seller
        const grouped = txs.reduce((acc, tx) => {
            const key = tx.sellerId ? tx.sellerId.toString() : "global";
            if (!acc[key])
                acc[key] = [];
            acc[key].push(tx);
            return acc;
        }, {});
        // 🧾 Gerar snapshots contábeis por seller
        for (const [sellerId, sellerTxs] of Object.entries(grouped)) {
            const debitTotal = sellerTxs
                .filter((t) => t.status === "failed")
                .reduce((sum, t) => sum + t.amount, 0);
            const creditTotal = sellerTxs
                .filter((t) => t.status === "approved")
                .reduce((sum, t) => sum + (t.netAmount || 0), 0);
            const balance = creditTotal - debitTotal;
            const snapshot = new ledgerSnapshot_model_1.default({
                dateKey,
                sellerId: sellerId === "global" ? undefined : new mongoose_1.Types.ObjectId(sellerId),
                account: "operational",
                balance,
                debitTotal,
                creditTotal,
                locked: false,
            });
            await snapshot.save();
            console.log(`✅ Snapshot criado → ${sellerId === "global" ? "GLOBAL" : sellerId} | Saldo: R$ ${balance.toFixed(2)}`);
        }
        console.log("\n📘 [LedgerEngine] Fechamento contábil concluído com sucesso.");
    }
}
exports.LedgerEngine = LedgerEngine;
/* -------------------------------------------------------------------------- */
/* 🌐 Execução direta (CLI) – Conecta no Mongo e roda o fechamento            */
/* -------------------------------------------------------------------------- */
if (require.main === module) {
    const MONGO_URI = process.env.MONGO_URI ||
        "mongodb+srv://cadu_db_user:R74srMzIT1f4L3W8@gateway-core.u26ywbv.mongodb.net/gateway-db?retryWrites=true&w=majority&appName=gateway-core";
    (async () => {
        try {
            console.log("🌐 Conectando ao MongoDB Atlas...");
            await mongoose_1.default.connect(MONGO_URI);
            console.log("✅ Conectado ao MongoDB Atlas.");
            await LedgerEngine.run();
        }
        catch (err) {
            console.error("❌ Erro ao executar LedgerEngine:", err);
        }
        finally {
            await mongoose_1.default.disconnect();
            console.log("🔌 Conexão encerrada.");
            process.exit(0);
        }
    })();
}
