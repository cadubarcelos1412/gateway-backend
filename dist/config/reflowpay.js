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
const PAGARME_API_URL = process.env.PAGARME_API_URL || "https://api.pagar.me/1";
const PAGARME_API_KEY = process.env.PAGARME_API_KEY || "";
// ✅ Função corrigida para aceitar waiting_payment
const mapStatusToLegacy = (status) => {
    switch (status) {
        case "approved":
            return "completed";
        case "failed":
        case "refunded":
            return "failed";
        case "waiting_payment":
        case "pending":
        default:
            return "pending";
    }
};
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
        const response = await axios_1.default.post(`${PAGARME_API_URL}/transactions`, {
            api_key: PAGARME_API_KEY,
            amount: Math.round(payload.value * 100),
            payment_method: "pix",
            postback_url: "https://api.kissapagamentos.com/api/transactions/webhook",
            customer: {
                external_id: transaction._id.toString(),
                name: payload.customer?.name || "Cliente Kissa",
                type: "individual",
                country: "br",
                email: payload.customer?.email || "",
                documents: [
                    {
                        type: "cpf",
                        number: payload.customer?.document?.number || "00000000000",
                    },
                ],
                phone_numbers: [payload.customer?.phone || ""],
            },
            items: [
                {
                    title: "Depósito Kissa Pagamentos",
                    unit_price: Math.round(payload.value * 100),
                    quantity: 1,
                    tangible: false,
                },
            ],
        });
        const pixPayload = response.data?.pix_qr_code || response.data?.pix?.qrcode || null;
        if (!pixPayload)
            throw new Error("PIX não retornado pela adquirente.");
        return {
            transactionId: transaction._id.toString(),
            amount: payload.value,
            pix: pixPayload,
            status: mapStatusToLegacy(transaction.status),
        };
    }
    catch (error) {
        console.error("❌ Erro em createReflowTransactionPix:", error);
        return null;
    }
};
exports.createReflowTransactionPix = createReflowTransactionPix;
const createReflowTransactionCard = async (payload) => {
    try {
        const user = await user_model_1.User.findById(payload.userId);
        if (!user)
            return null;
        const fixedFee = user?.split?.cashIn?.creditCard?.fixed ??
            user?.split?.cashIn?.pix?.fixed ??
            0;
        const percentageFee = user?.split?.cashIn?.creditCard?.percentage ??
            user?.split?.cashIn?.pix?.percentage ??
            0;
        const fee = fixedFee + (payload.value * percentageFee) / 100;
        const netAmount = payload.value - fee;
        const transaction = new transaction_model_1.Transaction({
            userId: payload.userId,
            amount: payload.value,
            fee,
            netAmount,
            status: "pending",
            method: "credit_card",
        });
        await transaction.save();
        const expiration = `${payload.card?.expirationMonth}${String(payload.card?.expirationYear).slice(-2)}` || "";
        const response = await axios_1.default.post(`${PAGARME_API_URL}/transactions`, {
            api_key: PAGARME_API_KEY,
            amount: Math.round(payload.value * 100),
            payment_method: "credit_card",
            card_number: payload.card?.number,
            card_cvv: payload.card?.cvv,
            card_expiration_date: expiration,
            card_holder_name: payload.card?.holderName,
            postback_url: "https://api.kissapagamentos.com/api/transactions/webhook",
            customer: {
                external_id: transaction._id.toString(),
                name: payload.customer?.name || "Cliente Kissa",
                type: "individual",
                country: "br",
                email: payload.customer?.email || "",
                documents: [
                    {
                        type: "cpf",
                        number: payload.customer?.document?.number || "00000000000",
                    },
                ],
                phone_numbers: [payload.customer?.phone || ""],
            },
            items: [
                {
                    title: "Depósito Kissa Pagamentos",
                    unit_price: Math.round(payload.value * 100),
                    quantity: 1,
                    tangible: false,
                },
            ],
        });
        const statusPayload = response.data?.status || "pending";
        transaction.status =
            statusPayload === "paid"
                ? "approved"
                : statusPayload === "refused"
                    ? "failed"
                    : "pending";
        await transaction.save();
        return {
            transactionId: transaction._id.toString(),
            amount: payload.value,
            status: mapStatusToLegacy(transaction.status),
        };
    }
    catch (error) {
        console.error("❌ Erro em createReflowTransactionCard:", error);
        return null;
    }
};
exports.createReflowTransactionCard = createReflowTransactionCard;
