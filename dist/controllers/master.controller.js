"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMostSaleProducts = exports.getKpas = exports.validateMasterToken = exports.generateMasterToken = void 0;
const transaction_model_1 = require("../models/transaction.model");
const user_model_1 = require("../models/user.model");
const auth_1 = require("../config/auth");
/**
 * 🔐 Gera token master (via SECRET_TOKEN do .env)
 */
const generateMasterToken = async (req, res) => {
    const { auth } = req.body;
    if (!auth || auth !== process.env.SECRET_TOKEN) {
        res.status(403).json({ status: false, msg: "Token secreto inválido." });
        return;
    }
    const token = await (0, auth_1.createToken)({ id: "master", role: "master" });
    res.status(200).json({ status: true, token });
};
exports.generateMasterToken = generateMasterToken;
/**
 * ✅ Valida token master (apenas para debug ou testes)
 */
const validateMasterToken = async (req, res) => {
    const { token } = req.body;
    const payload = await (0, auth_1.decodeToken)(token);
    const isValid = payload?.role === "master";
    res.status(200).json({ status: isValid });
};
exports.validateMasterToken = validateMasterToken;
/**
 * 📊 Retorna métricas gerais da plataforma
 */
const getKpas = async (_req, res) => {
    try {
        const today = new Date();
        // 📦 Busca dados
        const [transactions, users] = await Promise.all([
            transaction_model_1.Transaction.find().lean(),
            user_model_1.User.find().lean(),
        ]);
        const approvedTx = transactions.filter((t) => t.status === "approved");
        // 📊 Cálculos principais
        const volumeTotal = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        const volumeHoje = transactions
            .filter((t) => t.createdAt && new Date(t.createdAt).toDateString() === today.toDateString())
            .reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalUsuarios = users.length;
        const usuariosHoje = users.filter((u) => u.createdAt && new Date(u.createdAt).toDateString() === today.toDateString()).length;
        const totalTaxas = transactions.reduce((sum, t) => sum + (t.fee || 0), 0);
        const taxasMensais = transactions
            .filter((t) => t.createdAt &&
            new Date(t.createdAt).getMonth() === today.getMonth() &&
            new Date(t.createdAt).getFullYear() === today.getFullYear())
            .reduce((sum, t) => sum + (t.fee || 0), 0);
        const taxaConversao = transactions.length > 0 ? (approvedTx.length / transactions.length) * 100 : 0;
        const ticketMedio = transactions.length > 0 ? volumeTotal / transactions.length : 0;
        const volumePorMetodo = transactions.reduce((acc, t) => {
            if (!t.method)
                return acc;
            acc[t.method] = (acc[t.method] || 0) + (t.amount || 0);
            return acc;
        }, {});
        // 📤 Resposta final
        res.status(200).json({
            status: true,
            metrics: {
                volumeTotal,
                volumeHoje,
                totalUsuarios,
                usuariosHoje,
                totalTaxas,
                taxasMensais,
                taxaConversao: `${taxaConversao.toFixed(2)}%`,
                ticketMedio: Number(ticketMedio.toFixed(2)),
                volumePorMetodo,
            },
        });
    }
    catch (error) {
        console.error("❌ Erro em getKpas:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao calcular KPIs." });
    }
};
exports.getKpas = getKpas;
/**
 * 🏆 Top 10 produtos mais vendidos
 */
const getMostSaleProducts = async (_req, res) => {
    try {
        const top = await transaction_model_1.Transaction.aggregate([
            { $match: { status: "approved" } },
            { $unwind: "$purchaseData.products" },
            {
                $group: {
                    _id: "$purchaseData.products.name",
                    product: { $first: "$purchaseData.products" },
                    userId: { $first: "$userId" },
                    totalSold: { $sum: 1 },
                    totalRevenue: { $sum: "$purchaseData.products.price" },
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "user",
                },
            },
            {
                $addFields: {
                    userEmail: { $arrayElemAt: ["$user.email", 0] },
                    userName: { $arrayElemAt: ["$user.name", 0] },
                },
            },
            { $project: { user: 0 } },
            { $sort: { totalSold: -1 } },
            { $limit: 10 },
        ]);
        res.status(200).json({ status: true, topProducts: top });
    }
    catch (error) {
        console.error("❌ Erro em getMostSaleProducts:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao buscar top produtos." });
    }
};
exports.getMostSaleProducts = getMostSaleProducts;
