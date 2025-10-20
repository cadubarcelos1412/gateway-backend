import { ITransaction, Transaction } from "../models/transaction.model";
import axios from "axios";
import { TransactionCardResponse, TransactionPayload, TransactionPixResponse } from "./transaction.type";
import { User } from "../models/user.model";
import { GenerateSendIntegrations } from "./integration";
import { Types } from "mongoose";

const REFLOW_TOKEN = process.env.REFLOW_TOKEN as string;

const mapStatusToLegacy = (status: "pending" | "approved" | "failed"): "pending" | "completed" | "failed" => {
  return status === "approved" ? "completed" : status;
};

/* ------------------ 🪙 Criar transação PIX ------------------ */
export const createReflowTransactionPix = async (
  payload: TransactionPayload
): Promise<TransactionPixResponse | null> => {
  try {
    const user = await User.findById(payload.userId);
    if (!user) return null;

    const fixedFee = user?.split?.cashIn?.pix?.fixed || 0;
    const percentageFee = user?.split?.cashIn?.pix?.percentage || 0;

    const fee = fixedFee + (payload.value * percentageFee) / 100;
    const netAmount = payload.value - fee;

    const transaction = new Transaction({
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
    await GenerateSendIntegrations(user, transaction);

    const response = await axios.post(
      "https://api.cashtime.com.br/v1/transactions",
      {
        isInfoProducts: true,
        externalCode: (transaction._id as Types.ObjectId).toString(),
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
      },
      { headers: { "x-authorization-key": REFLOW_TOKEN } }
    );

    const pixPayload = (response.data as any)?.pix?.payload;
    if (!pixPayload) throw new Error("PIX code not found!");

    return {
      transactionId: (transaction._id as Types.ObjectId).toString(),
      amount: payload.value,
      pix: pixPayload,
      status: mapStatusToLegacy(transaction.status),
    };
  } catch (error) {
    console.error("Erro em createReflowTransactionPix:", error);
    return null;
  }
};

/* ------------------ 💳 Criar transação cartão ------------------ */
export const createReflowTransactionCard = async (
  payload: TransactionPayload
): Promise<TransactionCardResponse | null> => {
  try {
    const user = await User.findById(payload.userId);
    if (!user) return null;

    const fixedFee = user?.split?.cashIn?.creditCard?.fixed ?? user?.split?.cashIn?.pix?.fixed ?? 0;
    const percentageFee = user?.split?.cashIn?.creditCard?.percentage ?? user?.split?.cashIn?.pix?.percentage ?? 0;

    const fee = fixedFee + (payload.value * percentageFee) / 100;
    const netAmount = payload.value - fee;

    const transaction = new Transaction({
      userId: payload.userId,
      amount: payload.value,
      fee,
      netAmount,
      postback: payload.postback,
      status: "pending",
      method: "credit_card",
    });

    await transaction.save();

    const response = await axios.post(
      "https://api.cashtime.com.br/v1/transactions",
      {
        isInfoProducts: true,
        externalCode: (transaction._id as Types.ObjectId).toString(),
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
      },
      { headers: { "x-authorization-key": REFLOW_TOKEN } }
    );

    const statusPayload = (response.data as any)?.status || "pending";
    transaction.status = ["pending", "approved", "failed"].includes(statusPayload)
      ? (statusPayload as any)
      : "pending";

    await transaction.save();

    return {
      transactionId: (transaction._id as Types.ObjectId).toString(),
      amount: payload.value,
      status: mapStatusToLegacy(transaction.status),
    };
  } catch (error) {
    console.error("Erro em createReflowTransactionCard:", error);
    return null;
  }
};
