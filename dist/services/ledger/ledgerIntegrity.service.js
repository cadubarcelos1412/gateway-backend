"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerIntegrityService = void 0;
const crypto_1 = require("crypto");
const ledgerEntry_model_1 = __importDefault(require("../../models/ledger/ledgerEntry.model"));
const ledgerSnapshot_model_1 = __importDefault(require("../../models/ledger/ledgerSnapshot.model"));
/**
 * 🧠 LedgerIntegrityService
 * Valida integridade do ledger contábil (dupla entrada, sideHash, snapshots)
 */
class LedgerIntegrityService {
    /**
     * 🔍 Executa a auditoria completa de integridade
     */
    static async runIntegrityCheck() {
        const today = new Date();
        const dateKey = today.toISOString().substring(0, 10);
        console.log(`\n🧾 Iniciando auditoria contábil do ledger (${dateKey})...\n`);
        const batches = await ledgerEntry_model_1.default.aggregate([
            {
                $group: {
                    _id: "$batchId",
                    totalDebit: {
                        $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] },
                    },
                    totalCredit: {
                        $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] },
                    },
                    firstAccount: { $first: "$account" },
                    entries: { $push: "$$ROOT" },
                },
            },
        ]);
        let unbalancedBatches = 0;
        let brokenHashes = 0;
        const brokenHashBatches = [];
        const unbalancedBatchIds = [];
        // ✅ Validação por batch
        for (const batch of batches) {
            const { _id, totalDebit, totalCredit, entries } = batch;
            // 1️⃣ Verifica se o batch está balanceado
            if (Math.abs(totalDebit - totalCredit) > 0.01) {
                unbalancedBatches++;
                unbalancedBatchIds.push(_id.toString());
            }
            // 2️⃣ Verifica encadeamento dos sideHash
            let prevHash = "";
            for (const e of entries.sort((a, b) => a.sequence - b.sequence)) {
                const hashInput = `${prevHash}|${e.account}|${e.type}|${e.amount}|${e.currency}`;
                const computed = (0, crypto_1.createHash)("sha256").update(hashInput).digest("hex");
                if (computed !== e.sideHash) {
                    brokenHashes++;
                    brokenHashBatches.push(_id.toString());
                    break;
                }
                prevHash = e.sideHash;
            }
        }
        // 🔹 Verifica snapshots do dia
        const snapshotAccounts = await ledgerSnapshot_model_1.default.distinct("account", {
            dateKey,
        });
        const ledgerAccounts = await ledgerEntry_model_1.default.distinct("account", {
            createdAt: {
                $gte: new Date(`${dateKey}T00:00:00Z`),
                $lt: new Date(`${dateKey}T23:59:59Z`),
            },
        });
        const missingSnapshotAccounts = ledgerAccounts.filter((acc) => !snapshotAccounts.includes(acc));
        const report = {
            dateKey,
            verifiedBatches: batches.length,
            unbalancedBatches,
            brokenHashes,
            missingSnapshots: missingSnapshotAccounts.length,
            details: {
                brokenHashBatches: [...new Set(brokenHashBatches)],
                unbalancedBatchIds: [...new Set(unbalancedBatchIds)],
                missingSnapshotAccounts,
            },
        };
        LedgerIntegrityService.printReport(report);
        return report;
    }
    /**
     * 📊 Exibe relatório formatado no console
     */
    static printReport(report) {
        console.log(`📅 Data auditada: ${report.dateKey}`);
        console.log(`📦 Batches verificados: ${report.verifiedBatches}`);
        console.log(`💰 Batches desbalanceados: ${report.unbalancedBatches}`);
        console.log(`🔗 Quebras de hash detectadas: ${report.brokenHashes}`);
        console.log(`🧩 Snapshots ausentes: ${report.missingSnapshots}`);
        if (report.brokenHashes > 0 ||
            report.unbalancedBatches > 0 ||
            report.missingSnapshots > 0) {
            console.log("\n⚠️ Detalhes de inconsistências:");
            if (report.details.unbalancedBatchIds.length)
                console.log(" - Batches desbalanceados:", report.details.unbalancedBatchIds);
            if (report.details.brokenHashBatches.length)
                console.log(" - Quebras de hash:", report.details.brokenHashBatches);
            if (report.details.missingSnapshotAccounts.length)
                console.log(" - Snapshots ausentes:", report.details.missingSnapshotAccounts);
        }
        else {
            console.log("\n✅ Ledger íntegro. Nenhuma inconsistência detectada.");
        }
    }
}
exports.LedgerIntegrityService = LedgerIntegrityService;
