import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { decodeToken } from "../config/auth";
import { User, IUser } from "../models/user.model";
import { CashoutService } from "../services/cashout.service";
import CashoutRequest from "../models/cashoutRequest.model";

/**
 * Confirma o PIN de saque antes de qualquer cashout (Pix ou USDT). Retorna
 * uma mensagem de erro em caso de falha, ou `null` se o PIN bateu.
 */
async function checkWithdrawalPin(user: IUser, providedPin: unknown): Promise<string | null> {
  if (!user.withdrawalPin?.hash) {
    return "Configure seu PIN de saque antes de continuar (Configurações > Segurança).";
  }
  if (!providedPin || typeof providedPin !== "string") {
    return "PIN de saque é obrigatório.";
  }
  const matches = await bcrypt.compare(providedPin, user.withdrawalPin.hash);
  return matches ? null : "PIN de saque incorreto.";
}

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

    const { amount, pin } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ status: false, msg: "Valor de saque inválido." });
      return;
    }

    const user = await User.findById(payload.id);
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    const pinError = await checkWithdrawalPin(user, pin);
    if (pinError) {
      res.status(401).json({ status: false, msg: pinError });
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
/* 🪙 1️⃣b Seller cria solicitação de saque em USDT (Zendry)                  */
/* -------------------------------------------------------------------------- */
/**
 * Ao contrário de createCashoutRequest, NÃO abre uma transação aqui —
 * CashoutService.createCryptoCashout gerencia suas próprias transações
 * internamente, de propósito (ver comentário na definição do método):
 * a chamada real à Zendry é irreversível e não pode ficar no meio de uma
 * transação que ainda pode abortar depois.
 */
export const createCryptoCashoutRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload?.id) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { amount, destinationAddress, pin } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ status: false, msg: "Valor de saque inválido." });
      return;
    }
    if (!destinationAddress || typeof destinationAddress !== "string") {
      res.status(400).json({ status: false, msg: "Endereço de destino (wallet USDT) é obrigatório." });
      return;
    }

    const user = await User.findById(payload.id);
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    const pinError = await checkWithdrawalPin(user, pin);
    if (pinError) {
      res.status(401).json({ status: false, msg: pinError });
      return;
    }

    const { cashout, usdtAmount } = await CashoutService.createCryptoCashout(
      user._id as Types.ObjectId,
      amount,
      destinationAddress
    );

    res.status(201).json({
      status: true,
      msg: "✅ Saque em USDT enviado com sucesso.",
      data: {
        id: (cashout._id as Types.ObjectId).toString(),
        amountBRL: cashout.amount,
        usdtAmount,
        destinationAddress: cashout.destinationAddress,
        status: cashout.status,
        externalReference: cashout.externalReference,
      },
    });
  } catch (error: any) {
    console.error("❌ Erro em createCryptoCashoutRequest:", error);
    res.status(400).json({
      status: false,
      msg: error.message || "Erro ao processar saque em USDT.",
    });
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
