"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSplitFees = exports.updateSplitFees = exports.createAdminUser = exports.loginUser = exports.registerUser = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const user_model_1 = require("../models/user.model");
const auth_1 = require("../config/auth");
/* --------------------------------------------------------------------------
 🆕 REGISTRO DE USUÁRIO
--------------------------------------------------------------------------- */
const registerUser = async (req, res) => {
    try {
        const { name, email, password, document, role } = req.body;
        if (!email || !password || !document) {
            res.status(400).json({
                status: false,
                msg: "Email, senha e documento são obrigatórios.",
            });
            return;
        }
        const existingEmail = await user_model_1.User.findOne({ email });
        if (existingEmail) {
            res.status(400).json({ status: false, msg: "E-mail já cadastrado." });
            return;
        }
        const existingDocument = await user_model_1.User.findOne({ document });
        if (existingDocument) {
            res.status(400).json({ status: false, msg: "CPF/CNPJ já cadastrado." });
            return;
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const user = await user_model_1.User.create({
            name,
            email,
            password: hashedPassword,
            document,
            role: role || "seller",
            status: "active",
            createdAt: new Date(),
        });
        res.status(201).json({
            status: true,
            msg: "Usuário registrado com sucesso.",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    }
    catch (error) {
        console.error("❌ Erro ao registrar usuário:", error);
        res.status(500).json({ status: false, msg: "Erro interno no servidor." });
    }
};
exports.registerUser = registerUser;
/* --------------------------------------------------------------------------
 🔐 LOGIN DE USUÁRIO (PADRÃO UNIFICADO)
--------------------------------------------------------------------------- */
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await user_model_1.User.findOne({ email });
        if (!user) {
            res.status(401).json({ status: false, msg: "Usuário não encontrado." });
            return;
        }
        if (user.status !== "active") {
            res.status(403).json({ status: false, msg: "Conta inativa ou bloqueada." });
            return;
        }
        const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            res.status(401).json({ status: false, msg: "Senha incorreta." });
            return;
        }
        // 👇 Corrigido o erro de tipagem do _id (TypeScript reconhece como unknown)
        const userId = user._id.toString();
        const token = await (0, auth_1.createToken)({
            id: userId,
            role: user.role,
        });
        res.status(200).json({
            status: true,
            msg: "Login realizado com sucesso.",
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
            },
        });
    }
    catch (error) {
        console.error("❌ Erro no login:", error);
        res.status(500).json({
            status: false,
            msg: "Erro interno no servidor. Tente novamente mais tarde.",
        });
    }
};
exports.loginUser = loginUser;
/* --------------------------------------------------------------------------
 👑 CRIAÇÃO DE ADMIN
--------------------------------------------------------------------------- */
const createAdminUser = async (req, res) => {
    try {
        const { name, email, password, document } = req.body;
        const existingUser = await user_model_1.User.findOne({ email });
        if (existingUser) {
            res.status(400).json({ status: false, msg: "Admin já cadastrado." });
            return;
        }
        const hash = await bcrypt_1.default.hash(password, 10);
        const user = await user_model_1.User.create({
            name,
            email,
            password: hash,
            document: document || "00000000000",
            role: "admin",
            status: "active",
            createdAt: new Date(),
        });
        res.status(201).json({
            status: true,
            msg: "Administrador criado com sucesso.",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    }
    catch (error) {
        console.error("❌ Erro ao criar admin:", error);
        res.status(500).json({ status: false, msg: "Erro interno no servidor." });
    }
};
exports.createAdminUser = createAdminUser;
/* --------------------------------------------------------------------------
 💸 ATUALIZAÇÃO DE SPLIT FEES
--------------------------------------------------------------------------- */
const updateSplitFees = async (req, res) => {
    try {
        const { id } = req.params;
        const { split } = req.body;
        const user = await user_model_1.User.findByIdAndUpdate(id, { split }, { new: true });
        if (!user) {
            res.status(404).json({ status: false, msg: "Usuário não encontrado." });
            return;
        }
        res.status(200).json({ status: true, msg: "Split fees atualizadas.", user });
    }
    catch (error) {
        console.error("❌ Erro ao atualizar split fees:", error);
        res.status(500).json({ status: false, msg: "Erro interno no servidor." });
    }
};
exports.updateSplitFees = updateSplitFees;
/* --------------------------------------------------------------------------
 📊 OBTÉM SPLIT FEES
--------------------------------------------------------------------------- */
const getSplitFees = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await user_model_1.User.findById(id).lean();
        if (!user) {
            res.status(404).json({ status: false, msg: "Usuário não encontrado." });
            return;
        }
        const split = user.split || null;
        res.status(200).json({ status: true, split });
    }
    catch (error) {
        console.error("❌ Erro ao buscar split fees:", error);
        res.status(500).json({ status: false, msg: "Erro interno no servidor." });
    }
};
exports.getSplitFees = getSplitFees;
