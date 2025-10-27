import { Request, Response } from "express";
import { Transaction } from "../models/transaction.model";
import { Seller } from "../models/seller.model";

/**
 * 📊 Score de risco de um seller
 */
export const getSellerScore = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const seller = await Seller.findById(id);
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    const transactions = await Transaction.find({ sellerId: seller._id });
    const total = transactions.length;
    const highRisk = transactions.filter((t) => t.flags?.includes("HIGH_AMOUNT")).length;
    const foreignIp = transactions.filter((t) => t.flags?.includes("FOREIGN_IP")).length;

    const score = Math.max(0, 100 - (highRisk * 10 + foreignIp * 5));

    res.status(200).json({
      status: true,
      seller: {
        id: seller._id,
        name: seller.name,
        kycStatus: seller.kycStatus,
      },
      score,
      metrics: { total, highRisk, foreignIp },
    });
  } catch (error) {
    console.error("❌ Erro em getSellerScore:", error);
    res.status(500).json({ status: false, msg: "Erro ao calcular score do seller." });
  }
};

/**
 * 📈 Score de risco de uma transação
 */
export const getTransactionScore = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      res.status(404).json({ status: false, msg: "Transação não encontrada." });
      return;
    }

    const riskPoints = transaction.flags?.includes("HIGH_AMOUNT")
      ? 60
      : transaction.flags?.includes("FOREIGN_IP")
      ? 30
      : 10;

    const score = Math.max(0, 100 - riskPoints);

    res.status(200).json({
      status: true,
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        method: transaction.method,
        status: transaction.status,
      },
      score,
    });
  } catch (error) {
    console.error("❌ Erro em getTransactionScore:", error);
    res.status(500).json({ status: false, msg: "Erro ao calcular score da transação." });
  }
};
