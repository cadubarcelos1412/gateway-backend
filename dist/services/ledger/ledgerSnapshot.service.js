"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerSnapshotService = void 0;
// src/services/ledger/ledgerSnapshot.service.ts
const mongoose_1 = __importDefault(require("mongoose"));
const ledgerEntry_model_1 = __importDefault(require("../../models/ledger/ledgerEntry.model"));
const ledgerSnapshot_model_1 = __importDefault(require("../../models/ledger/ledgerSnapshot.model"));
const helpers_1 = require("../../models/ledger/helpers");
/**
 * 📊 LedgerSnapshotService
 * Consolida lançamentos do ledger em saldos diários (snapshot imutável).
 *
 * - Gera snapshots por conta e por seller
 * - Pode ser executado automaticamente ao final de cada dia (LedgerBatch)
 * - Garante idempotência (um snapshot por dataKey + conta + seller)
 */
class LedgerSnapshotService {
    /**
     * 🔹 Gera snapshots de um dia específico
     * @param date Data base (ex: new Date("2025-10-21"))
     */
    static async createDailySnapshots(date) {
        const session = await mongoose_1.default.startSession();
        session.startTransaction();
        try {
            const dateKey = date.toISOString().split("T")[0]; // "2025-10-21"
            console.log(`📆 Iniciando snapshot diário: ${dateKey}`);
            // 1️⃣ Busca todos os lançamentos do dia
            const startOfDay = new Date(`${dateKey}T00:00:00.000Z`);
            const endOfDay = new Date(`${dateKey}T23:59:59.999Z`);
            const aggregates = await ledgerEntry_model_1.default.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startOfDay, $lte: endOfDay },
                    },
                },
                {
                    $group: {
                        _id: {
                            account: "$account",
                            sellerId: "$sellerId",
                        },
                        debitTotal: {
                            $sum: {
                                $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0],
                            },
                        },
                        creditTotal: {
                            $sum: {
                                $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0],
                            },
                        },
                    },
                },
                {
                    $project: {
                        account: "$_id.account",
                        sellerId: "$_id.sellerId",
                        debitTotal: 1,
                        creditTotal: 1,
                        balance: { $subtract: ["$debitTotal", "$creditTotal"] },
                        _id: 0,
                    },
                },
            ]);
            // 2️⃣ Insere snapshots (ou atualiza se já existir)
            for (const agg of aggregates) {
                await ledgerSnapshot_model_1.default.updateOne({
                    dateKey,
                    sellerId: agg.sellerId,
                    account: agg.account,
                }, {
                    $set: {
                        debitTotal: (0, helpers_1.round2)(agg.debitTotal),
                        creditTotal: (0, helpers_1.round2)(agg.creditTotal),
                        balance: (0, helpers_1.round2)(agg.balance),
                        createdAt: new Date(),
                    },
                }, { upsert: true, session });
            }
            await session.commitTransaction();
            console.log(`✅ Snapshot diário criado com sucesso (${aggregates.length} contas consolidadas).`);
        }
        catch (err) {
            await session.abortTransaction();
            console.error("❌ Erro ao criar snapshot diário:", err);
            throw err;
        }
        finally {
            session.endSession();
        }
    }
    /**
     * 🔸 Retorna snapshots de um dia específico.
     */
    static async getSnapshotsByDate(date) {
        const dateKey = date.toISOString().split("T")[0];
        return await ledgerSnapshot_model_1.default.find({ dateKey }).sort({ account: 1 }).lean();
    }
    /**
     * 🔍 Retorna histórico de saldo de uma conta ao longo do tempo.
     */
    static async getAccountHistory(account, sellerId) {
        const match = { account };
        if (sellerId)
            match.sellerId = new mongoose_1.default.Types.ObjectId(sellerId);
        return await ledgerSnapshot_model_1.default.find(match)
            .sort({ dateKey: 1 })
            .select("dateKey balance debitTotal creditTotal -_id")
            .lean();
    }
    /**
     * 📈 Retorna evolução de saldo global (todas as contas).
     */
    static async getGlobalTrend() {
        const result = await ledgerSnapshot_model_1.default.aggregate([
            {
                $group: {
                    _id: "$dateKey",
                    totalBalance: { $sum: "$balance" },
                },
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    dateKey: "$_id",
                    totalBalance: 1,
                    _id: 0,
                },
            },
        ]);
        return result.map(r => ({
            date: r.dateKey,
            totalBalance: (0, helpers_1.round2)(r.totalBalance),
        }));
    }
}
exports.LedgerSnapshotService = LedgerSnapshotService;
