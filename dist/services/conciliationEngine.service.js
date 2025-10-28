"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConciliationEngine = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ledgerSnapshot_model_1 = __importDefault(require("../models/ledger/ledgerSnapshot.model"));
const transaction_model_1 = require("../models/transaction.model");
/**
 * 🧮 ConciliationEngine (T+1)
 * - Compara snapshots contábeis do dia anterior com extratos externos (mock)
 * - Calcula divergência percentual e bloqueia cashouts se ≥ 5%
 */
class ConciliationEngine {
    static async run() {
        console.log("\n🧾 [ConciliationEngine] Iniciando conciliação T+1...");
        // 📅 Definir data de ontem (T+1)
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const dateKey = yesterday.toISOString().split("T")[0];
        // 🗂️ Buscar snapshots do dia anterior
        const snapshots = await ledgerSnapshot_model_1.default.find({ dateKey });
        if (snapshots.length === 0) {
            console.warn(`⚠️ Nenhum snapshot encontrado para ${dateKey}.`);
            return;
        }
        // 💳 Buscar transações do dia anterior
        const txs = await transaction_model_1.Transaction.find({
            createdAt: {
                $gte: new Date(`${dateKey}T00:00:00.000Z`),
                $lte: new Date(`${dateKey}T23:59:59.999Z`)
            }
        });
        if (txs.length === 0) {
            console.log(`📭 Nenhuma transação encontrada para ${dateKey}.`);
            return;
        }
        // 🏦 Extratos simulados (mock até integração real)
        const acquirerStatement = this.mockAcquirerStatement(txs);
        const bankStatement = this.mockBankStatement(txs);
        // 🧾 Somar totais contábeis
        const ledgerTotals = snapshots.reduce((acc, snap) => {
            acc.totalCredit += snap.creditTotal;
            acc.totalDebit += snap.debitTotal;
            acc.balance += snap.balance;
            return acc;
        }, { totalCredit: 0, totalDebit: 0, balance: 0 });
        const ledgerTotal = ledgerTotals.balance;
        const externalTotal = acquirerStatement.total - bankStatement.fees;
        const divergence = this.calculateDivergence(ledgerTotal, externalTotal);
        // 🧩 Atualizar snapshots com resultados
        for (const snapshot of snapshots) {
            snapshot.divergence = divergence;
            snapshot.locked = divergence >= 0.05;
            await snapshot.save();
        }
        // 📊 Logs de auditoria
        console.log("\n📊 [Conciliation Result]");
        console.log(`   📅 Data: ${dateKey}`);
        console.log(`   🧾 Ledger Total: R$ ${ledgerTotal.toFixed(2)}`);
        console.log(`   🏦 Extrato Externo Total: R$ ${externalTotal.toFixed(2)}`);
        console.log(`   ⚖️ Divergência: ${(divergence * 100).toFixed(2)}%`);
        console.log(`   🔒 Locked: ${divergence >= 0.05 ? "Sim" : "Não"}`);
        if (divergence >= 0.05) {
            console.warn("🚨 Divergência crítica detectada — cashouts bloqueados.");
        }
        else {
            console.log("✅ Conciliação contábil concluída com sucesso.");
        }
    }
    /**
     * Mock do extrato da adquirente (total aprovado)
     */
    static mockAcquirerStatement(txs) {
        const total = txs
            .filter(t => t.status === "approved")
            .reduce((sum, t) => sum + (t.netAmount || 0), 0);
        return { total };
    }
    /**
     * Mock do extrato bancário (total líquido com taxas)
     */
    static mockBankStatement(txs) {
        const total = txs
            .filter(t => t.status === "approved")
            .reduce((sum, t) => sum + (t.netAmount || 0), 0);
        const fees = total * 0.005; // 0,5% de taxa bancária
        return { total, fees };
    }
    /**
     * Calcula a divergência percentual entre ledger e extrato
     */
    static calculateDivergence(ledger, external) {
        const diff = Math.abs(ledger - external);
        const max = Math.max(ledger, external);
        return max === 0 ? 0 : diff / max;
    }
}
exports.ConciliationEngine = ConciliationEngine;
/* -------------------------------------------------------------------------- */
/* 🌐 Conexão automática com o Mongo Atlas                                    */
/* -------------------------------------------------------------------------- */
if (require.main === module) {
    const MONGO_URI = process.env.MONGO_URI ||
        "mongodb+srv://cadu_db_user:R74srMzIT1f4L3W8@gateway-core.u26ywbv.mongodb.net/gateway-db?retryWrites=true&w=majority&appName=gateway-core";
    (async () => {
        try {
            console.log("🌐 Conectando ao MongoDB Atlas...");
            await mongoose_1.default.connect(MONGO_URI);
            console.log("✅ Conectado ao MongoDB Atlas.");
            await ConciliationEngine.run();
        }
        catch (err) {
            console.error("❌ Erro ao executar conciliação:", err);
        }
        finally {
            await mongoose_1.default.disconnect();
            console.log("🔌 Conexão encerrada.");
            process.exit(0);
        }
    })();
}
