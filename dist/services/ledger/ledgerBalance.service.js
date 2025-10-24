"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerBalanceService = void 0;
// src/services/ledger/ledgerBalance.service.ts
const mongoose_1 = __importDefault(require("mongoose"));
const ledgerEntry_model_1 = __importDefault(require("../../models/ledger/ledgerEntry.model"));
const helpers_1 = require("../../models/ledger/helpers");
/**
 * 📊 Serviço de leitura de saldos contábeis
 * Calcula saldos de qualquer conta ou seller a partir dos lançamentos (LedgerEntry).
 *
 * ⚙️ Todos os métodos usam agregações MongoDB para performance e precisão.
 */
class LedgerBalanceService {
    /**
     * 🔹 Retorna o saldo total de todas as contas por seller.
     * Útil para dashboards e auditorias globais.
     */
    static async getBalanceBySeller(sellerId) {
        const result = await ledgerEntry_model_1.default.aggregate([
            { $match: { sellerId: new mongoose_1.default.Types.ObjectId(sellerId) } },
            {
                $group: {
                    _id: "$account",
                    debit: { $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] } },
                    credit: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] } },
                },
            },
            {
                $project: {
                    account: "$_id",
                    balance: { $subtract: ["$debit", "$credit"] },
                    _id: 0,
                },
            },
            { $sort: { account: 1 } },
        ]);
        return result.map(r => ({
            account: r.account,
            balance: (0, helpers_1.round2)(r.balance),
        }));
    }
    /**
     * 🔸 Retorna o saldo de uma conta específica (por seller).
     */
    static async getBalanceByAccount(sellerId, account) {
        const result = await ledgerEntry_model_1.default.aggregate([
            {
                $match: {
                    sellerId: new mongoose_1.default.Types.ObjectId(sellerId),
                    account,
                },
            },
            {
                $group: {
                    _id: "$account",
                    debit: { $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] } },
                    credit: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] } },
                },
            },
            {
                $project: {
                    account: "$_id",
                    balance: { $subtract: ["$debit", "$credit"] },
                    _id: 0,
                },
            },
        ]);
        return result.length > 0 ? (0, helpers_1.round2)(result[0].balance) : 0;
    }
    /**
     * 🔹 Retorna o balancete (trial balance) agrupado por conta.
     * Pode ser usado para relatórios diários/mensais.
     */
    static async getTrialBalanceByPeriod(startDate, endDate) {
        const result = await ledgerEntry_model_1.default.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: startDate,
                        $lt: endDate,
                    },
                },
            },
            {
                $group: {
                    _id: "$account",
                    totalDebit: { $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] } },
                    totalCredit: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] } },
                },
            },
            {
                $project: {
                    account: "$_id",
                    totalDebit: 1,
                    totalCredit: 1,
                    balance: { $subtract: ["$totalDebit", "$totalCredit"] },
                    _id: 0,
                },
            },
            { $sort: { account: 1 } },
        ]);
        return result.map(r => ({
            account: r.account,
            totalDebit: (0, helpers_1.round2)(r.totalDebit),
            totalCredit: (0, helpers_1.round2)(r.totalCredit),
            balance: (0, helpers_1.round2)(r.balance),
        }));
    }
    /**
     * 🔍 Retorna saldo consolidado total (soma de todas as contas de todos os sellers).
     * Usado em relatórios executivos e dashboards financeiros.
     */
    static async getGlobalBalance() {
        const result = await ledgerEntry_model_1.default.aggregate([
            {
                $group: {
                    _id: "$account",
                    debit: { $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] } },
                    credit: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] } },
                },
            },
            {
                $project: {
                    account: "$_id",
                    balance: { $subtract: ["$debit", "$credit"] },
                    _id: 0,
                },
            },
            { $sort: { account: 1 } },
        ]);
        return result.map(r => ({
            account: r.account,
            balance: (0, helpers_1.round2)(r.balance),
        }));
    }
}
exports.LedgerBalanceService = LedgerBalanceService;
