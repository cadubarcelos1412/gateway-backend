"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerBatchService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ledgerEntry_model_1 = __importDefault(require("../../models/ledger/ledgerEntry.model"));
const ledgerBatch_model_1 = __importDefault(require("../../models/ledger/ledgerBatch.model"));
const ledgerSnapshot_service_1 = require("./ledgerSnapshot.service");
/**
 * 📦 LedgerBatchService
 * Responsável por fechar o dia contábil (batch diário).
 *
 * - Agrega os lançamentos do ledger
 * - Gera um registro de fechamento (LedgerBatch)
 * - Dispara o snapshot diário consolidado
 */
class LedgerBatchService {
    /**
     * 🔹 Fecha o lote diário de lançamentos (imutável)
     */
    static async closeDailyBatch(date = new Date()) {
        const session = await mongoose_1.default.startSession();
        session.startTransaction();
        try {
            const dateKey = date.toISOString().split("T")[0];
            console.log(`📅 Fechando lote contábil do dia ${dateKey}...`);
            // Evita duplicar o batch se já foi fechado
            const exists = await ledgerBatch_model_1.default.findOne({ dateKey });
            if (exists && exists.closed) {
                console.log(`⚠️ Lote ${dateKey} já fechado anteriormente.`);
                await session.abortTransaction();
                return;
            }
            // Agrega total do dia
            const startOfDay = new Date(`${dateKey}T00:00:00.000Z`);
            const endOfDay = new Date(`${dateKey}T23:59:59.999Z`);
            const totals = await ledgerEntry_model_1.default.aggregate([
                {
                    $match: { createdAt: { $gte: startOfDay, $lte: endOfDay } },
                },
                {
                    $group: {
                        _id: null,
                        totalEntries: { $sum: 1 },
                        totalDebit: {
                            $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] },
                        },
                        totalCredit: {
                            $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] },
                        },
                    },
                },
            ]);
            if (totals.length === 0) {
                console.log(`⚠️ Nenhum lançamento encontrado para ${dateKey}.`);
                await session.abortTransaction();
                return;
            }
            const t = totals[0];
            const batchId = new mongoose_1.default.Types.ObjectId();
            await ledgerBatch_model_1.default.create([
                {
                    dateKey,
                    batchId,
                    totalEntries: t.totalEntries,
                    totalDebit: t.totalDebit,
                    totalCredit: t.totalCredit,
                    closed: true,
                    closedAt: new Date(),
                },
            ], { session });
            // 🔁 Gera snapshot diário automaticamente
            await ledgerSnapshot_service_1.LedgerSnapshotService.createDailySnapshots(date);
            await session.commitTransaction();
            console.log(`✅ Lote contábil ${dateKey} fechado com sucesso.`);
        }
        catch (err) {
            await session.abortTransaction();
            console.error("❌ Erro ao fechar lote contábil:", err);
            throw err;
        }
        finally {
            session.endSession();
        }
    }
    /**
     * 📊 Consulta status do lote de um dia
     */
    static async getBatchStatus(date) {
        const dateKey = date.toISOString().split("T")[0];
        return await ledgerBatch_model_1.default.findOne({ dateKey }).lean();
    }
}
exports.LedgerBatchService = LedgerBatchService;
