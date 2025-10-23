import { Request, Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { TransactionService } from "../services/transaction.service";
import { Transaction } from "../models/transaction.model";

/* -------------------------------------------------------------------------- */
/* 📤 Criar transação real – Multiadquirente (Enterprise)                      */
/* -------------------------------------------------------------------------- */
export const createTransaction = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await TransactionService.createTransaction(req, session);
    await session.commitTransaction();

    res.status(201).json({
      status: true,
      msg: `✅ Transação criada com sucesso via ${result.acquirer}.`,
      transaction: result.transaction,
      reservaRisco: result.reservaRisco,
      liquidoSeller: result.liquidoSeller,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Erro em createTransaction:", error);

    res.status(500).json({
      status: false,
      msg: (error as Error).message || "Erro ao criar transação.",
    });
  } finally {
    session.endSession();
  }
};

/* -------------------------------------------------------------------------- */
/* 🔎 Consultar transação por ID                                              */
/* -------------------------------------------------------------------------- */
export const consultTransactionByID = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.query;
    if (!id || typeof id !== "string") {
      res.status(400).json({ status: false, msg: "ID da transação é obrigatório." });
      return;
    }

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      res.status(404).json({ status: false, msg: "Transação não encontrada." });
      return;
    }

    res.status(200).json({ status: true, transaction });
  } catch (error) {
    console.error("❌ Erro em consultTransactionByID:", error);
    res.status(500).json({ status: false, msg: "Erro ao consultar transação." });
  }
};

/* -------------------------------------------------------------------------- */
/* 🔁 Webhook – Atualiza status (Pagar.me)                                    */
/* -------------------------------------------------------------------------- */
export const webhookTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { externalCode, status } = req.body;
    const signature = req.headers["x-hub-signature"] as string;
    const secret = process.env.INTERNAL_WEBHOOK_SECRET || "";

    const expected = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (signature !== expected) {
      res.status(403).json({ status: false, msg: "Assinatura inválida." });
      return;
    }

    const transaction = await Transaction.findOne({ externalId: externalCode });
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
  } catch (error) {
    console.error("❌ Erro em webhookTransaction:", error);
    res.status(500).json({ status: false, msg: "Erro ao processar webhook." });
  }
};
