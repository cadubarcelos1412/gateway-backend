"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettlementEngine = void 0;
// src/services/ledger/settlementEngine.service.ts
const mongoose_1 = __importDefault(require("mongoose"));
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const ledgerSnapshot_model_1 = __importDefault(require("../../models/ledger/ledgerSnapshot.model"));
const cashoutRequest_model_1 = __importDefault(require("../../models/cashoutRequest.model")); // default export do model
const transactionAudit_service_1 = require("../transactionAudit.service");
const ledger_accounts_1 = require("../../config/ledger-accounts");
dotenv_1.default.config();
/**
 * 🏦 SettlementEngine (Liquidação Bancária D+2)
 * - Consulta liquidações confirmadas na adquirente (ex.: Pagar.me)
 * - Atualiza snapshots contábeis e marca cashouts como liquidados
 * - Registra auditoria e divergências
 */
class SettlementEngine {
    static async run() {
        console.log("\n🏦 [SettlementEngine] Iniciando liquidação D+2...");
        try {
            console.log("🌐 Conectando ao MongoDB Atlas...");
            await mongoose_1.default.connect(process.env.MONGO_URI);
            console.log("✅ Conectado ao MongoDB Atlas.\n");
            // 🔎 Cashouts criados até D+2 e ainda pendentes
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 2);
            const pendingCashouts = await cashoutRequest_model_1.default.find({
                createdAt: { $lte: cutoff },
                status: "pending",
            });
            if (pendingCashouts.length === 0) {
                console.log("⚠️ Nenhum cashout pendente de liquidação (D+2).");
                return;
            }
            console.log(`🔍 ${pendingCashouts.length} cashouts aguardando confirmação.\n`);
            // ⚙️ Integração com Pagar.me (exemplo de listagem de transfers)
            const pagarmeApi = "https://api.pagar.me/core/v5/transfers";
            const headers = { Authorization: `Basic ${process.env.PAGARME_API_KEY}` };
            // Opcional: pode-se paginar/filtrar por data
            const response = await axios_1.default.get(pagarmeApi, { headers });
            const transfers = response.data?.data || [];
            for (const cashout of pendingCashouts) {
                try {
                    // sellerRef cobre projetos que usam userId no lugar de sellerId
                    const sellerRef = cashout.sellerId ??
                        cashout.userId ??
                        null;
                    // 🧩 Tenta achar uma transferência compatível (valor e, se existir, conta destino)
                    const match = transfers.find((t) => {
                        const sameAmount = Math.abs(t.amount / 100 - cashout.amount) < 0.01; // tolerância centesimal
                        const sameBank = !cashout.bankAccountId ||
                            t.bank_account?.id === cashout.bankAccountId;
                        return sameAmount && sameBank && ["paid", "completed"].includes(t.status);
                    });
                    if (!match) {
                        console.log(`⚠️ Nenhuma liquidação encontrada para cashout ${cashout._id}`);
                        continue;
                    }
                    // 🧾 Atualiza status do cashout
                    cashout.status = "settled";
                    cashout.settledAt = new Date();
                    await cashout.save();
                    // 🧮 Atualiza LedgerSnapshot (reduz passivo do seller)
                    const dateKey = new Date().toISOString().split("T")[0];
                    await ledgerSnapshot_model_1.default.updateOne({
                        dateKey,
                        account: ledger_accounts_1.LEDGER_ACCOUNTS.PASSIVO_SELLER,
                        sellerId: sellerRef,
                    }, { $inc: { balance: -cashout.amount } }, { upsert: true });
                    // 🧠 Log de auditoria
                    await transactionAudit_service_1.TransactionAuditService.log({
                        transactionId: new mongoose_1.default.Types.ObjectId(),
                        sellerId: sellerRef ?? new mongoose_1.default.Types.ObjectId(), // fallback seguro
                        userId: sellerRef ?? undefined,
                        amount: cashout.amount,
                        method: "pix",
                        status: "approved",
                        kycStatus: "verified",
                        flags: [],
                        description: `Liquidação confirmada (Pagar.me transfer ${match.id})`,
                    });
                    console.log(`✅ Liquidação confirmada: R$${cashout.amount.toFixed(2)} para ${sellerRef ?? "seller-desconhecido"}`);
                }
                catch (innerErr) {
                    console.warn("⚠️ Falha ao conciliar cashout:", innerErr);
                }
            }
        }
        catch (err) {
            console.error("❌ Erro no SettlementEngine:", err);
        }
        finally {
            await mongoose_1.default.connection.close();
            console.log("🔌 Conexão encerrada.\n");
        }
    }
}
exports.SettlementEngine = SettlementEngine;
// 🚀 Execução direta via CLI
if (require.main === module) {
    SettlementEngine.run();
}
