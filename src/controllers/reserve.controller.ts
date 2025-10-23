import { Request, Response } from "express";
import mongoose from "mongoose";
import { decodeToken } from "../config/auth";
import { ReleaseReserveService } from "../services/releaseReserve.service";

/* -------------------------------------------------------------------------- */
/* 🔓 Liberação manual de reserva técnica (somente MASTER)                    */
/* -------------------------------------------------------------------------- */
export const releaseReserve = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(403).json({ status: false, msg: "Token ausente." });
      return;
    }

    const payload = await decodeToken(token);
    if (payload?.role !== "master") {
      res.status(403).json({
        status: false,
        msg: "Acesso negado. Apenas usuários MASTER podem liberar reservas.",
      });
      return;
    }

    const { sellerId, amount, reason } = req.body;
    if (!sellerId || !amount) {
      res.status(400).json({ status: false, msg: "Campos obrigatórios: sellerId e amount." });
      return;
    }

    const result = await ReleaseReserveService.releaseReserve(
      new mongoose.Types.ObjectId(sellerId),
      Number(amount),
      reason || "Liberação manual de reserva técnica",
      session
    );

    await session.commitTransaction();

    res.status(200).json({
      status: true,
      msg: "✅ Reserva liberada com sucesso.",
      data: {
        sellerId,
        amount: result.amount,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("❌ Erro em releaseReserve:", error);
    res.status(500).json({
      status: false,
      msg: error.message || "Erro interno ao liberar reserva.",
    });
  } finally {
    session.endSession();
  }
};
