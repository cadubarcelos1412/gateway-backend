"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMonthlyVolume = exports.getDailyVolume = void 0;
const transaction_model_1 = require("../models/transaction.model");
/* -------------------------------------------------------
📆 Volume diário de transações – gráfico de linha
-------------------------------------------------------- */
const getDailyVolume = async (req, res) => {
    try {
        const { startDate, endDate, method } = req.query;
        const match = {};
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate)
                match.createdAt.$gte = new Date(startDate);
            if (endDate)
                match.createdAt.$lte = new Date(endDate);
        }
        if (method)
            match.method = method;
        const dailyVolume = await transaction_model_1.Transaction.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    totalAmount: { $sum: "$amount" },
                    totalNet: { $sum: "$netAmount" },
                    count: { $sum: 1 },
                },
            },
            { $sort: { "_id": 1 } },
        ]);
        res.status(200).json({
            status: true,
            range: { startDate, endDate },
            dailyVolume,
        });
    }
    catch (error) {
        console.error("❌ Erro em getDailyVolume:", error);
        res.status(500).json({ status: false, msg: "Erro ao gerar volume diário." });
    }
};
exports.getDailyVolume = getDailyVolume;
/* -------------------------------------------------------
📅 Volume mensal de transações – gráfico de barras
-------------------------------------------------------- */
const getMonthlyVolume = async (req, res) => {
    try {
        const { year, method } = req.query;
        const match = {};
        if (year) {
            const start = new Date(`${year}-01-01`);
            const end = new Date(`${Number(year) + 1}-01-01`);
            match.createdAt = { $gte: start, $lt: end };
        }
        if (method)
            match.method = method;
        const monthlyVolume = await transaction_model_1.Transaction.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    totalAmount: { $sum: "$amount" },
                    totalNet: { $sum: "$netAmount" },
                    count: { $sum: 1 },
                },
            },
            { $sort: { "_id": 1 } },
        ]);
        res.status(200).json({
            status: true,
            year: year || "all",
            monthlyVolume,
        });
    }
    catch (error) {
        console.error("❌ Erro em getMonthlyVolume:", error);
        res.status(500).json({ status: false, msg: "Erro ao gerar volume mensal." });
    }
};
exports.getMonthlyVolume = getMonthlyVolume;
