"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProduct = exports.editProduct = exports.deleteProduct = exports.createProduct = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const product_model_1 = require("../models/product.model");
const auth_1 = require("../config/auth");
const user_model_1 = require("../models/user.model");
/* -------------------------------------------------------
🔐 Utilitário – Buscar usuário autenticado pelo token
-------------------------------------------------------- */
const getUserFromToken = async (token) => {
    if (!token)
        return null;
    const payload = await (0, auth_1.decodeToken)(token.replace("Bearer ", ""));
    if (!payload?.id)
        return null;
    return await user_model_1.User.findById(payload.id).lean();
};
/* -------------------------------------------------------
🆕 Criar produto
-------------------------------------------------------- */
const createProduct = async (req, res) => {
    try {
        const user = await getUserFromToken(req.headers.authorization);
        if (!user) {
            res.status(403).json({ status: false, msg: "Token inválido ou usuário não autenticado." });
            return;
        }
        let { name, description, price, status, category } = req.body;
        if (!name || price === undefined) {
            res.status(400).json({ status: false, msg: "Campos obrigatórios: 'name' e 'price'." });
            return;
        }
        if (typeof status === "boolean") {
            status = status ? "active" : "inactive";
        }
        const product = new product_model_1.Product({
            userId: user._id,
            name,
            description,
            price,
            status: status ?? "active",
            category: category ?? "infoproduto",
            sales: { approved: 0, pending: 0, refused: 0 },
            createdAt: new Date(),
        });
        await product.save();
        res.status(201).json({
            status: true,
            msg: "✅ Produto criado com sucesso.",
            product,
        });
    }
    catch (error) {
        console.error("❌ Erro em createProduct:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao criar produto." });
    }
};
exports.createProduct = createProduct;
/* -------------------------------------------------------
🗑️ Deletar produto
-------------------------------------------------------- */
const deleteProduct = async (req, res) => {
    try {
        const user = await getUserFromToken(req.headers.authorization);
        if (!user) {
            res.status(403).json({ status: false, msg: "Token inválido ou usuário não autenticado." });
            return;
        }
        const { name } = req.body;
        if (!name) {
            res.status(400).json({ status: false, msg: "O campo 'name' é obrigatório para deletar o produto." });
            return;
        }
        const deleted = await product_model_1.Product.deleteOne({ name, userId: user._id });
        if (!deleted.deletedCount) {
            res.status(404).json({ status: false, msg: "Produto não encontrado." });
            return;
        }
        res.status(200).json({ status: true, msg: "✅ Produto deletado com sucesso." });
    }
    catch (error) {
        console.error("❌ Erro em deleteProduct:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao deletar produto." });
    }
};
exports.deleteProduct = deleteProduct;
/* -------------------------------------------------------
✏️ Editar produto
-------------------------------------------------------- */
const editProduct = async (req, res) => {
    try {
        const user = await getUserFromToken(req.headers.authorization);
        if (!user) {
            res.status(403).json({ status: false, msg: "Token inválido ou usuário não autenticado." });
            return;
        }
        let { oldName, newName, description, price, status, category } = req.body;
        if (!oldName) {
            res.status(400).json({ status: false, msg: "O campo 'oldName' é obrigatório para editar um produto." });
            return;
        }
        if (typeof status === "boolean") {
            status = status ? "active" : "inactive";
        }
        const product = await product_model_1.Product.findOne({ name: oldName, userId: user._id });
        if (!product) {
            res.status(404).json({ status: false, msg: "Produto não encontrado." });
            return;
        }
        if (newName)
            product.name = newName;
        if (description)
            product.description = description;
        if (price !== undefined)
            product.price = price;
        if (status)
            product.status = status;
        if (category)
            product.category = category;
        await product.save();
        res.status(200).json({
            status: true,
            msg: "✅ Produto atualizado com sucesso.",
            product,
        });
    }
    catch (error) {
        console.error("❌ Erro em editProduct:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao atualizar produto." });
    }
};
exports.editProduct = editProduct;
/* -------------------------------------------------------
🔍 Obter produto por ID
-------------------------------------------------------- */
const getProduct = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            res.status(400).json({ status: false, msg: "O parâmetro 'id' é obrigatório." });
            return;
        }
        const query = mongoose_1.default.Types.ObjectId.isValid(id) ? { _id: id } : { id };
        const product = await product_model_1.Product.findOne(query);
        if (!product) {
            res.status(404).json({ status: false, msg: "Produto não encontrado." });
            return;
        }
        res.status(200).json({ status: true, product });
    }
    catch (error) {
        console.error("❌ Erro em getProduct:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao buscar produto." });
    }
};
exports.getProduct = getProduct;
