import { Request, Response } from "express";
import mongoose from "mongoose";
import { CashoutService } from "../services/cashout.service";

/**
 * 💸 Controller de Cashouts
 * - Criação, aprovação e rejeição de saques.
 */

/* -------------------------------------------------------------------------- */
/* 1️⃣ Criar solicitação de saque                                              */
/* -------------------------------------------------------------------------- */
export const createCashout = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, amount } = req.body;

    const cashout = await CashoutService.createCashout(new mongoose.Types.ObjectId(userId), amount, session);

    await session.commitTransaction();
    res.status(201).json({
      status: true,
      msg: "Solicitação de saque criada com sucesso.",
      cashout,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Erro em createCashout:", error);
    res.status(500).json({
      status: false,
      msg: (error as Error).message,
    });
  } finally {
    session.endSession();
  }
};

/* -------------------------------------------------------------------------- */
/* 2️⃣ Aprovar solicitação de saque                                            */
/* -------------------------------------------------------------------------- */
export const approveCashout = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { cashoutId, adminId } = req.body;

    const result = await CashoutService.approveCashout(
      new mongoose.Types.ObjectId(cashoutId),
      new mongoose.Types.ObjectId(adminId),
      session
    );

    await session.commitTransaction();
    res.status(200).json({
      status: true,
      msg: "Saque aprovado e registrado no ledger.",
      result,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Erro em approveCashout:", error);
    res.status(500).json({
      status: false,
      msg: (error as Error).message,
    });
  } finally {
    session.endSession();
  }
};

/* -------------------------------------------------------------------------- */
/* 3️⃣ Rejeitar solicitação de saque                                           */
/* -------------------------------------------------------------------------- */
export const rejectCashout = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { cashoutId, adminId, reason } = req.body;

    const result = await CashoutService.rejectCashout(
      new mongoose.Types.ObjectId(cashoutId),
      new mongoose.Types.ObjectId(adminId),
      reason,
      session
    );

    await session.commitTransaction();
    res.status(200).json({
      status: true,
      msg: "Saque rejeitado com sucesso.",
      result,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Erro em rejectCashout:", error);
    res.status(500).json({
      status: false,
      msg: (error as Error).message,
    });
  } finally {
    session.endSession();
  }
};
