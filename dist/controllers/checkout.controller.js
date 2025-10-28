"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCheckout = exports.deleteCheckout = exports.getCheckout = exports.getPublicCheckout = exports.createCheckout = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../config/auth");
const user_model_1 = require("../models/user.model");
const product_model_1 = require("../models/product.model");
const checkout_model_1 = require("../models/checkout.model");
/* 🔑 Utilitário: pegar usuário pelo token */
const getUserFromToken = async (token) => {
    if (!token)
        return null;
    const payload = await (0, auth_1.decodeToken)(token.replace("Bearer ", ""));
    if (!payload?.id)
        return null;
    return await user_model_1.User.findById(payload.id).lean();
};
/* 🛒 Criar novo checkout */
const createCheckout = async (req, res) => {
    try {
        const user = await getUserFromToken(req.headers.authorization);
        if (!user) {
            res.status(403).json({ status: false, msg: "Token inválido." });
            return;
        }
        const { productId, productName, settings } = req.body;
        // ✅ Valida campos obrigatórios
        if (!productId && !productName) {
            res.status(400).json({ status: false, msg: "Informe o ID ou o nome do produto." });
            return;
        }
        if (!settings?.headCode || !settings?.bodyCode) {
            res.status(400).json({ status: false, msg: "Campos headCode e bodyCode são obrigatórios." });
            return;
        }
        // 🔍 Busca o produto por ID ou nome
        const productQuery = { userId: user._id };
        if (productId) {
            if (!mongoose_1.default.Types.ObjectId.isValid(productId)) {
                res.status(400).json({ status: false, msg: "ID de produto inválido." });
                return;
            }
            productQuery._id = new mongoose_1.default.Types.ObjectId(productId);
        }
        if (productName)
            productQuery.name = productName;
        const product = await product_model_1.Product.findOne(productQuery).lean();
        if (!product) {
            res.status(404).json({ status: false, msg: "Produto não encontrado." });
            return;
        }
        // 🏗️ Cria o checkout
        const checkout = new checkout_model_1.Checkout({
            userId: user._id,
            productId: product._id,
            settings: {
                logoUrl: "/",
                bannerUrl: "/",
                redirectUrl: "/",
                validateDocument: false,
                needAddress: false,
                headCode: settings.headCode,
                bodyCode: settings.bodyCode,
            },
            paymentMethods: {
                creditCard: { enabled: true, discount: 0 },
                pix: { enabled: true, discount: 0 },
                boleto: { enabled: true, expirationDays: 3, discount: 0 },
            },
            whatsappButton: { status: false, number: "" },
            countdownTimer: { status: false, title: "", time: 0 },
            orderBump: { status: false, productId: "" },
            testimonials: { status: false, reviews: [] },
            background: "white",
            colors: "#FF9800",
        });
        const savedCheckout = await checkout.save();
        res.status(201).json({
            status: true,
            msg: "Checkout criado com sucesso.",
            checkoutId: String(savedCheckout._id),
            product: { id: String(product._id), name: product.name },
        });
    }
    catch (error) {
        console.error("❌ Erro em createCheckout:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao criar checkout." });
    }
};
exports.createCheckout = createCheckout;
/* 🌐 Obter checkout público */
const getPublicCheckout = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id || typeof id !== "string" || !mongoose_1.default.Types.ObjectId.isValid(id)) {
            res.status(400).json({ status: false, msg: "ID do checkout inválido." });
            return;
        }
        const checkout = await checkout_model_1.Checkout.findById(new mongoose_1.default.Types.ObjectId(id)).lean();
        if (!checkout) {
            res.status(404).json({ status: false, msg: "Checkout não encontrado." });
            return;
        }
        const user = await user_model_1.User.findById(checkout.userId).lean();
        if (!user ||
            (typeof user.status === "boolean" && user.status === false) ||
            (typeof user.status === "string" && user.status.toLowerCase() !== "active")) {
            res.status(403).json({ status: false, msg: "Checkout inválido ou usuário inativo." });
            return;
        }
        const product = await product_model_1.Product.findById(checkout.productId).lean();
        res.status(200).json({ status: true, checkout, product });
    }
    catch (error) {
        console.error("❌ Erro em getPublicCheckout:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao consultar checkout." });
    }
};
exports.getPublicCheckout = getPublicCheckout;
/* 🔐 Obter checkout do usuário autenticado */
const getCheckout = async (req, res) => {
    try {
        const user = await getUserFromToken(req.headers.authorization);
        if (!user) {
            res.status(403).json({ status: false, msg: "Token inválido." });
            return;
        }
        const { id } = req.query;
        if (!id || typeof id !== "string" || !mongoose_1.default.Types.ObjectId.isValid(id)) {
            res.status(400).json({ status: false, msg: "ID do checkout inválido." });
            return;
        }
        const checkout = await checkout_model_1.Checkout.findOne({
            _id: new mongoose_1.default.Types.ObjectId(id),
            userId: user._id,
        }).lean();
        if (!checkout) {
            res.status(404).json({ status: false, msg: "Checkout não encontrado." });
            return;
        }
        res.status(200).json({ status: true, checkout });
    }
    catch (error) {
        console.error("❌ Erro em getCheckout:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao buscar checkout." });
    }
};
exports.getCheckout = getCheckout;
/* ❌ Deletar checkout */
const deleteCheckout = async (req, res) => {
    try {
        const user = await getUserFromToken(req.headers.authorization);
        if (!user) {
            res.status(403).json({ status: false, msg: "Token inválido." });
            return;
        }
        const { id } = req.body;
        if (!id || !mongoose_1.default.Types.ObjectId.isValid(id)) {
            res.status(400).json({ status: false, msg: "ID do checkout inválido." });
            return;
        }
        const result = await checkout_model_1.Checkout.deleteOne({ _id: new mongoose_1.default.Types.ObjectId(id), userId: user._id });
        if (result.deletedCount === 0) {
            res.status(404).json({ status: false, msg: "Checkout não encontrado." });
            return;
        }
        res.status(200).json({ status: true, msg: "Checkout deletado com sucesso." });
    }
    catch (error) {
        console.error("❌ Erro em deleteCheckout:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao deletar checkout." });
    }
};
exports.deleteCheckout = deleteCheckout;
/* 🔄 Atualizar checkout */
const updateCheckout = async (req, res) => {
    try {
        const user = await getUserFromToken(req.headers.authorization);
        if (!user) {
            res.status(403).json({ status: false, msg: "Token inválido." });
            return;
        }
        const { _id, ...updates } = req.body;
        if (!_id || !mongoose_1.default.Types.ObjectId.isValid(_id)) {
            res.status(400).json({ status: false, msg: "ID do checkout inválido." });
            return;
        }
        const checkout = await checkout_model_1.Checkout.findOneAndUpdate({ _id: new mongoose_1.default.Types.ObjectId(_id), userId: user._id }, { $set: updates }, { new: true, runValidators: true, lean: true });
        if (!checkout) {
            res.status(404).json({ status: false, msg: "Checkout não encontrado." });
            return;
        }
        res.status(200).json({ status: true, msg: "Checkout atualizado com sucesso.", checkout });
    }
    catch (error) {
        console.error("❌ Erro em updateCheckout:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao atualizar checkout." });
    }
};
exports.updateCheckout = updateCheckout;
