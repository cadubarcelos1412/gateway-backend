"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookTransaction = exports.consultTransactionByID = exports.createTransaction = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const transaction_service_1 = require("../services/transaction.service");
const transaction_model_1 = require("../models/transaction.model");
/* -------------------------------------------------------------------------- */
/* 📤 Criar transação real – Multiadquirente (Enterprise)                      */
/* -------------------------------------------------------------------------- */
const createTransaction = async (req, res) => {
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const result = await transaction_service_1.TransactionService.createTransaction(req, session);
        await session.commitTransaction();
        res.status(201).json({
            status: true,
            msg: `✅ Transação criada com sucesso via ${result.acquirer}.`,
            transaction: result.transaction,
            reservaRisco: result.reservaRisco,
            liquidoSeller: result.liquidoSeller,
        });
    }
    catch (error) {
        await session.abortTransaction();
        console.error("❌ Erro em createTransaction:", error);
        res.status(500).json({
            status: false,
            msg: error.message || "Erro ao criar transação.",
        });
    }
    finally {
        session.endSession();
    }
};
exports.createTransaction = createTransaction;
/* -------------------------------------------------------------------------- */
/* 🔎 Consultar transação por ID                                              */
/* -------------------------------------------------------------------------- */
const consultTransactionByID = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id || typeof id !== "string") {
            res.status(400).json({ status: false, msg: "ID da transação é obrigatório." });
            return;
        }
        const transaction = await transaction_model_1.Transaction.findById(id);
        if (!transaction) {
            res.status(404).json({ status: false, msg: "Transação não encontrada." });
            return;
        }
        res.status(200).json({ status: true, transaction });
    }
    catch (error) {
        console.error("❌ Erro em consultTransactionByID:", error);
        res.status(500).json({ status: false, msg: "Erro ao consultar transação." });
    }
};
exports.consultTransactionByID = consultTransactionByID;
/* -------------------------------------------------------------------------- */
/* 🔁 Webhook – Atualiza status (Pagar.me)                                    */
/* -------------------------------------------------------------------------- */
const webhookTransaction = async (req, res) => {
    try {
        const { externalCode, status } = req.body;
        const signature = req.headers["x-hub-signature"];
        const secret = process.env.INTERNAL_WEBHOOK_SECRET || "";
        const expected = crypto_1.default
            .createHmac("sha256", secret)
            .update(JSON.stringify(req.body))
            .digest("hex");
        if (signature !== expected) {
            res.status(403).json({ status: false, msg: "Assinatura inválida." });
            return;
        }
        const transaction = await transaction_model_1.Transaction.findOne({ externalId: externalCode });
        if (!transaction) {
            res.status(404).json({ status: false, msg: "Transação não encontrada." });
            return;
        }
        transaction.status = ["pending", "approved", "failed"].includes(status)
            ? status
            : "pending";
        await transaction.save();
        res.status(200).json({
            status: true,
            msg: "✅ Status atualizado com sucesso.",
            transaction,
        });
    }
    catch (error) {
        console.error("❌ Erro em webhookTransaction:", error);
        res.status(500).json({ status: false, msg: "Erro ao processar webhook." });
    }
};
exports.webhookTransaction = webhookTransaction;
