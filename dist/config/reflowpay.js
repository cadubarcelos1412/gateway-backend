"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReflowTransactionCard = exports.createReflowTransactionPix = void 0;
const transaction_model_1 = require("../models/transaction.model");
const axios_1 = __importDefault(require("axios"));
const user_model_1 = require("../models/user.model");
const integration_1 = require("./integration");
const REFLOW_TOKEN = process.env.REFLOW_TOKEN;
const mapStatusToLegacy = (status) => {
    return status === "approved" ? "completed" : status;
};
/* ------------------ 🪙 Criar transação PIX ------------------ */
const createReflowTransactionPix = async (payload) => {
    try {
        const user = await user_model_1.User.findById(payload.userId);
        if (!user)
            return null;
        const fixedFee = user?.split?.cashIn?.pix?.fixed || 0;
        const percentageFee = user?.split?.cashIn?.pix?.percentage || 0;
        const fee = fixedFee + (payload.value * percentageFee) / 100;
        const netAmount = payload.value - fee;
        const transaction = new transaction_model_1.Transaction({
            userId: payload.userId,
            amount: payload.value,
            fee,
            netAmount,
            postback: payload.postback,
            status: "pending",
            method: "pix",
            purchaseData: {
                customer: {
                    name: payload.customer?.name || "",
                    email: payload.customer?.email || "",
                    document: payload.customer?.document?.number || "",
                    phone: payload.customer?.phone || "",
                    ip: payload.ip || "",
                },
                products: payload.products || [],
            },
        });
        await transaction.save();
        await (0, integration_1.GenerateSendIntegrations)(user, transaction);
        const response = await axios_1.default.post("https://api.cashtime.com.br/v1/transactions", {
            isInfoProducts: true,
            externalCode: transaction._id.toString(),
            paymentMethod: "pix",
            installments: 1,
            installmentFee: 1,
            customer: {
                name: payload.customer?.name || "",
                email: payload.customer?.email || "",
                document: payload.customer?.document?.number || "",
                phone: payload.customer?.phone || "",
            },
            items: [
                {
                    title: "Depósito em AgillePay",
                    description: "Agille Pay",
                    unitPrice: Math.round(payload.value * 100),
                    quantity: 1,
                    tangible: false,
                },
            ],
            postbackUrl: "https://api.agillepay.com/api/transactions/webhook",
            ip: payload.ip || "",
        }, { headers: { "x-authorization-key": REFLOW_TOKEN } });
        const pixPayload = response.data?.pix?.payload;
        if (!pixPayload)
            throw new Error("PIX code not found!");
        return {
            transactionId: transaction._id.toString(),
            amount: payload.value,
            pix: pixPayload,
            status: mapStatusToLegacy(transaction.status),
        };
    }
    catch (error) {
        console.error("Erro em createReflowTransactionPix:", error);
        return null;
    }
};
exports.createReflowTransactionPix = createReflowTransactionPix;
/* ------------------ 💳 Criar transação cartão ------------------ */
const createReflowTransactionCard = async (payload) => {
    try {
        const user = await user_model_1.User.findById(payload.userId);
        if (!user)
            return null;
        const fixedFee = user?.split?.cashIn?.creditCard?.fixed ?? user?.split?.cashIn?.pix?.fixed ?? 0;
        const percentageFee = user?.split?.cashIn?.creditCard?.percentage ?? user?.split?.cashIn?.pix?.percentage ?? 0;
        const fee = fixedFee + (payload.value * percentageFee) / 100;
        const netAmount = payload.value - fee;
        const transaction = new transaction_model_1.Transaction({
            userId: payload.userId,
            amount: payload.value,
            fee,
            netAmount,
            postback: payload.postback,
            status: "pending",
            method: "credit_card",
        });
        await transaction.save();
        const response = await axios_1.default.post("https://api.cashtime.com.br/v1/transactions", {
            isInfoProducts: true,
            externalCode: transaction._id.toString(),
            paymentMethod: "credit_card",
            installments: 1,
            installmentFee: 1,
            customer: {
                name: payload.customer?.name || "",
                email: payload.customer?.email || "",
                document: payload.customer?.document?.number || "",
                phone: payload.customer?.phone || "",
            },
            card: payload.card,
            items: [
                {
                    title: "Depósito em AgillePay",
                    description: "Agille Pay",
                    unitPrice: Math.round(payload.value * 100),
                    quantity: 1,
                    tangible: false,
                },
            ],
            postbackUrl: "https://api.agillepay.com/api/transactions/webhook",
            ip: payload.ip || "",
        }, { headers: { "x-authorization-key": REFLOW_TOKEN } });
        const statusPayload = response.data?.status || "pending";
        transaction.status = ["pending", "approved", "failed"].includes(statusPayload)
            ? statusPayload
            : "pending";
        await transaction.save();
        return {
            transactionId: transaction._id.toString(),
            amount: payload.value,
            status: mapStatusToLegacy(transaction.status),
        };
    }
    catch (error) {
        console.error("Erro em createReflowTransactionCard:", error);
        return null;
    }
};
exports.createReflowTransactionCard = createReflowTransactionCard;
