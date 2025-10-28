"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashoutEngine = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ledgerSnapshot_model_1 = __importDefault(require("../../models/ledger/ledgerSnapshot.model"));
const wallet_model_1 = require("../../models/wallet.model");
const ledger_service_1 = require("./ledger.service");
const transactionAudit_service_1 = require("../transactionAudit.service");
const ledger_accounts_1 = require("../../config/ledger-accounts");
const fees_1 = require("../../utils/fees");
/**
 * 💰 CashoutEngine
 * Liberação automática D+1 com base nos snapshots contábeis.
 * - Só executa se locked = false (sem divergência)
 * - Debita o passivo e credita a conta bancária (caixa)
 * - Atualiza o saldo disponível do seller
 * - Registra log contábil e auditoria
 */
class CashoutEngine {
    static async run() {
        console.log("\n💸 [CashoutEngine] Iniciando liberação D+1...");
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateKey = yesterday.toISOString().split("T")[0];
        // 🔍 Buscar snapshots desbloqueados
        const snapshots = await ledgerSnapshot_model_1.default.find({ dateKey, locked: false });
        if (snapshots.length === 0) {
            console.warn(`⚠️ Nenhum snapshot elegível encontrado para ${dateKey}.`);
            return;
        }
        for (const snap of snapshots) {
            if (!snap.sellerId || snap.balance <= 0)
                continue;
            const wallet = await wallet_model_1.Wallet.findOne({ userId: snap.sellerId });
            if (!wallet) {
                console.warn(`⚠️ Carteira não encontrada para seller ${snap.sellerId}`);
                continue;
            }
            const value = (0, fees_1.round)(snap.balance);
            // 🧾 Lançamentos contábeis (débito no passivo e crédito no caixa)
            await (0, ledger_service_1.postLedgerEntries)([
                { account: ledger_accounts_1.LEDGER_ACCOUNTS.PASSIVO_SELLER, type: "debit", amount: value },
                { account: ledger_accounts_1.LEDGER_ACCOUNTS.CONTA_CORRENTE, type: "credit", amount: value },
            ], {
                idempotencyKey: `cashout:${snap.sellerId}:${dateKey}`,
                transactionId: new mongoose_1.default.Types.ObjectId().toString(),
                sellerId: snap.sellerId.toString(),
                source: { system: "cashout_engine", acquirer: "internal" },
                eventAt: new Date(),
            });
            // 💼 Atualiza carteira
            wallet.balance.available = Math.max(0, wallet.balance.available - value);
            // 🧾 Adiciona log de operação (tipo "withdraw")
            wallet.log.push({
                transactionId: new mongoose_1.default.Types.ObjectId(),
                type: "withdraw",
                method: "pix",
                amount: value,
                security: {
                    createdAt: new Date(),
                    ipAddress: "127.0.0.1",
                    userAgent: "cashout-engine/1.0",
                },
            });
            await wallet.save();
            // 🧠 Registra auditoria
            await transactionAudit_service_1.TransactionAuditService.log({
                transactionId: new mongoose_1.default.Types.ObjectId(),
                sellerId: snap.sellerId,
                userId: snap.sellerId,
                amount: value,
                method: "pix",
                status: "approved",
                kycStatus: "verified",
                flags: [],
                description: `Cashout automático D+1 (${dateKey})`,
            });
            console.log(`✅ Cashout executado → Seller ${snap.sellerId} | R$ ${value.toFixed(2)}`);
        }
        console.log("💰 [CashoutEngine] Liberação D+1 concluída com sucesso.");
    }
}
exports.CashoutEngine = CashoutEngine;
/* -------------------------------------------------------------------------- */
/* 🌐 Execução direta via CLI                                                  */
/* -------------------------------------------------------------------------- */
if (require.main === module) {
    const MONGO_URI = process.env.MONGO_URI ||
        "mongodb+srv://cadu_db_user:R74srMzIT1f4L3W8@gateway-core.u26ywbv.mongodb.net/gateway-db?retryWrites=true&w=majority&appName=gateway-core";
    (async () => {
        try {
            console.log("🌐 Conectando ao MongoDB Atlas...");
            await mongoose_1.default.connect(MONGO_URI);
            console.log("✅ Conectado ao MongoDB Atlas.");
            await CashoutEngine.run();
        }
        catch (err) {
            console.error("❌ Erro ao executar CashoutEngine:", err);
        }
        finally {
            await mongoose_1.default.disconnect();
            console.log("🔌 Conexão encerrada.");
            process.exit(0);
        }
    })();
}
