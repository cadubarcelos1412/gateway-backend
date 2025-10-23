import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { decodeToken } from "../config/auth";
import { User } from "../models/user.model";
import { CashoutService } from "../services/cashout.service";
import CashoutRequest from "../models/cashoutRequest.model";

/* -------------------------------------------------------------------------- */
/* 💸 1️⃣ Seller cria solicitação de saque                                    */
/* -------------------------------------------------------------------------- */
export const createCashoutRequest = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload?.id) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { amount } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ status: false, msg: "Valor de saque inválido." });
      return;
    }

    const user = await User.findById(payload.id);
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    const cashout = await CashoutService.createCashout(user._id as Types.ObjectId, amount, session);
    await session.commitTransaction();

    res.status(201).json({
      status: true,
      msg: "✅ Solicitação de saque criada com sucesso e aguardando aprovação.",
      data: {
        id: (cashout._id as Types.ObjectId).toString(),
        amount: cashout.amount,
        status: cashout.status,
        createdAt: cashout.createdAt,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("❌ Erro em createCashoutRequest:", error);
    res.status(500).json({
      status: false,
      msg: error.message || "Erro ao criar solicitação de saque.",
    });
  } finally {
    session.endSession();
  }
};

/* -------------------------------------------------------------------------- */
/* 📋 2️⃣ Listar todas as solicitações de saque (admin/master)                */
/* -------------------------------------------------------------------------- */
export const listCashoutRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado." });
      return;
    }

    const requests = await CashoutRequest.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: true,
      total: requests.length,
      data: requests.map((r: any) => ({
        id: r._id.toString(),
        seller: r.userId,
        amount: r.amount,
        status: r.status,
        createdAt: r.createdAt,
        approvedAt: r.approvedAt || null,
        rejectionReason: r.rejectionReason || null,
      })),
    });
  } catch (error) {
    console.error("❌ Erro em listCashoutRequests:", error);
    res.status(500).json({ status: false, msg: "Erro ao listar solicitações." });
  }
};

/* -------------------------------------------------------------------------- */
/* 🔓 3️⃣ Aprovar solicitação de saque (admin/master)                         */
/* -------------------------------------------------------------------------- */
export const approveCashoutRequest = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado. Somente admins podem aprovar." });
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID inválido." });
      return;
    }

    const { cashout, wallet } = await CashoutService.approveCashout(
      new Types.ObjectId(id),
      new Types.ObjectId(payload.id),
      session
    );

    await session.commitTransaction();

    res.status(200).json({
      status: true,
      msg: "✅ Saque aprovado e contabilizado com sucesso.",
      data: {
        cashoutId: (cashout._id as Types.ObjectId).toString(),
        amount: cashout.amount,
        walletBalance: wallet.balance.available,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("❌ Erro em approveCashoutRequest:", error);
    res.status(500).json({ status: false, msg: error.message || "Erro ao aprovar saque." });
  } finally {
    session.endSession();
  }
};

/* -------------------------------------------------------------------------- */
/* 🚫 4️⃣ Rejeitar solicitação de saque (admin/master)                        */
/* -------------------------------------------------------------------------- */
export const rejectCashoutRequest = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado. Somente admins podem rejeitar." });
      return;
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID inválido." });
      return;
    }

    if (!reason) {
      res.status(400).json({ status: false, msg: "Motivo de rejeição é obrigatório." });
      return;
    }

    const { cashout, wallet } = await CashoutService.rejectCashout(
      new Types.ObjectId(id),
      new Types.ObjectId(payload.id),
      reason,
      session
    );

    await session.commitTransaction();

    res.status(200).json({
      status: true,
      msg: "🚫 Solicitação de saque rejeitada com sucesso.",
      data: {
        cashoutId: (cashout._id as Types.ObjectId).toString(),
        amount: cashout.amount,
        walletBalance: wallet.balance.available,
        reason: cashout.rejectionReason,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("❌ Erro em rejectCashoutRequest:", error);
    res.status(500).json({ status: false, msg: error.message || "Erro ao rejeitar saque." });
  } finally {
    session.endSession();
  }
};
