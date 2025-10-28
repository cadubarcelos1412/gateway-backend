"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.declineWithdrawal = exports.approveWithdrawal = exports.updateSellerConfig = exports.updateUser = exports.getLastTransactions = exports.getAllTransactions = exports.getAllUsers = exports.getMostSaleProducts = exports.getKpas = exports.validateMasterToken = exports.generateMasterToken = void 0;
const transaction_model_1 = require("../models/transaction.model");
const user_model_1 = require("../models/user.model");
const seller_model_1 = require("../models/seller.model");
const auth_1 = require("../config/auth");
/* -------------------------------------------------------------------------- */
/* 🔐 Gera token master (via SECRET_TOKEN do .env)                            */
/* -------------------------------------------------------------------------- */
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
/* -------------------------------------------------------------------------- */
/* ✅ Valida token master                                                    */
/* -------------------------------------------------------------------------- */
const validateMasterToken = async (req, res) => {
    const { token } = req.body;
    const payload = await (0, auth_1.decodeToken)(token);
    const isValid = payload?.role === "master";
    res.status(200).json({ status: isValid });
};
exports.validateMasterToken = validateMasterToken;
/* -------------------------------------------------------------------------- */
/* 📊 Retorna KPIs gerais                                                    */
/* -------------------------------------------------------------------------- */
const getKpas = async (_req, res) => {
    try {
        const today = new Date();
        const [transactions, users] = await Promise.all([
            transaction_model_1.Transaction.find().lean(),
            user_model_1.User.find().lean(),
        ]);
        const approvedTx = transactions.filter((t) => t.status === "approved");
        const volumeTotal = transactions.reduce((s, t) => s + (t.amount || 0), 0);
        const volumeHoje = transactions
            .filter((t) => t.createdAt && new Date(t.createdAt).toDateString() === today.toDateString())
            .reduce((s, t) => s + (t.amount || 0), 0);
        const totalUsuarios = users.length;
        const usuariosHoje = users.filter((u) => u.createdAt && new Date(u.createdAt).toDateString() === today.toDateString()).length;
        const totalTaxas = transactions.reduce((s, t) => s + (t.fee || 0), 0);
        const taxasMensais = transactions
            .filter((t) => t.createdAt &&
            new Date(t.createdAt).getMonth() === today.getMonth() &&
            new Date(t.createdAt).getFullYear() === today.getFullYear())
            .reduce((s, t) => s + (t.fee || 0), 0);
        const taxaConversao = transactions.length > 0 ? (approvedTx.length / transactions.length) * 100 : 0;
        const ticketMedio = transactions.length > 0 ? volumeTotal / transactions.length : 0;
        const volumePorMetodo = transactions.reduce((acc, t) => {
            if (!t.method)
                return acc;
            acc[t.method] = (acc[t.method] || 0) + (t.amount || 0);
            return acc;
        }, {});
        res.status(200).json({
            status: true,
            volumeTotal,
            volumeToday: volumeHoje,
            userVolumeTotal: totalUsuarios,
            userVolumeToday: usuariosHoje,
            taxVolumeTotal: totalTaxas,
            taxVolumeMonthly: taxasMensais,
            conversionRateTotal: taxaConversao,
            conversionRateMonthly: taxaConversao,
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
/* -------------------------------------------------------------------------- */
/* 🏆 Top 10 produtos mais vendidos                                          */
/* -------------------------------------------------------------------------- */
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
/* -------------------------------------------------------------------------- */
/* 👥 Listar usuários e transações                                           */
/* -------------------------------------------------------------------------- */
const getAllUsers = async (_req, res) => {
    try {
        const users = await user_model_1.User.find().select("-password").lean();
        res.status(200).json({ status: true, users });
    }
    catch (error) {
        console.error("❌ Erro em getAllUsers:", error);
        res.status(500).json({ status: false, msg: "Erro ao buscar usuários." });
    }
};
exports.getAllUsers = getAllUsers;
const getAllTransactions = async (_req, res) => {
    try {
        const transactions = await transaction_model_1.Transaction.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({ status: true, transactions });
    }
    catch (error) {
        console.error("❌ Erro em getAllTransactions:", error);
        res.status(500).json({ status: false, msg: "Erro ao buscar transações." });
    }
};
exports.getAllTransactions = getAllTransactions;
const getLastTransactions = async (_req, res) => {
    try {
        const transactions = await transaction_model_1.Transaction.find().sort({ createdAt: -1 }).limit(10).lean();
        res.status(200).json({ status: true, transactions });
    }
    catch (error) {
        console.error("❌ Erro em getLastTransactions:", error);
        res.status(500).json({ status: false, msg: "Erro ao buscar últimas transações." });
    }
};
exports.getLastTransactions = getLastTransactions;
/* -------------------------------------------------------------------------- */
/* ✏️ Atualizar usuário                                                      */
/* -------------------------------------------------------------------------- */
const updateUser = async (req, res) => {
    try {
        const { _id, ...updateData } = req.body;
        const user = await user_model_1.User.findByIdAndUpdate(_id, { $set: { ...updateData, updatedAt: new Date() } }, { new: true }).select("-password");
        if (!user) {
            res.status(404).json({ status: false, msg: "Usuário não encontrado." });
            return;
        }
        res.status(200).json({ status: true, msg: "Usuário atualizado com sucesso.", user });
    }
    catch (error) {
        console.error("❌ Erro em updateUser:", error);
        res.status(500).json({ status: false, msg: "Erro ao atualizar usuário." });
    }
};
exports.updateUser = updateUser;
/* -------------------------------------------------------------------------- */
/* 💼 Atualizar adquirente, taxas e reserva do Seller                        */
/* -------------------------------------------------------------------------- */
const updateSellerConfig = async (req, res) => {
    try {
        const { sellerId, acquirer, fees, reserve } = req.body;
        if (!sellerId) {
            res.status(400).json({ status: false, msg: "ID do seller é obrigatório." });
            return;
        }
        const seller = await seller_model_1.Seller.findByIdAndUpdate(sellerId, {
            $set: {
                "financialConfig.acquirer": acquirer,
                "financialConfig.fees": fees,
                "financialConfig.reserve": reserve,
                updatedAt: new Date(),
            },
        }, { new: true });
        if (!seller) {
            res.status(404).json({ status: false, msg: "Seller não encontrado." });
            return;
        }
        res.status(200).json({
            status: true,
            msg: "Configurações financeiras atualizadas com sucesso.",
            seller,
        });
    }
    catch (error) {
        console.error("❌ Erro em updateSellerConfig:", error);
        res.status(500).json({ status: false, msg: "Erro ao atualizar configurações do seller." });
    }
};
exports.updateSellerConfig = updateSellerConfig;
/* -------------------------------------------------------------------------- */
/* ✅ Aprovar ou rejeitar saques                                             */
/* -------------------------------------------------------------------------- */
const approveWithdrawal = async (req, res) => {
    try {
        const { id } = req.body;
        const tx = await transaction_model_1.Transaction.findByIdAndUpdate(id, { $set: { status: "completed", updatedAt: new Date() } }, { new: true });
        if (!tx) {
            res.status(404).json({ status: false, msg: "Transação não encontrada." });
            return;
        }
        res.status(200).json({ status: true, msg: "Saque aprovado com sucesso.", tx });
    }
    catch (error) {
        console.error("❌ Erro em approveWithdrawal:", error);
        res.status(500).json({ status: false, msg: "Erro ao aprovar saque." });
    }
};
exports.approveWithdrawal = approveWithdrawal;
const declineWithdrawal = async (req, res) => {
    try {
        const { id } = req.body;
        const tx = await transaction_model_1.Transaction.findByIdAndUpdate(id, { $set: { status: "failed", updatedAt: new Date() } }, { new: true });
        if (!tx) {
            res.status(404).json({ status: false, msg: "Transação não encontrada." });
            return;
        }
        if (tx.userId) {
            await user_model_1.User.findByIdAndUpdate(tx.userId, { $inc: { balance: tx.amount } });
        }
        res.status(200).json({ status: true, msg: "Saque rejeitado com sucesso.", tx });
    }
    catch (error) {
        console.error("❌ Erro em declineWithdrawal:", error);
        res.status(500).json({ status: false, msg: "Erro ao rejeitar saque." });
    }
};
exports.declineWithdrawal = declineWithdrawal;
