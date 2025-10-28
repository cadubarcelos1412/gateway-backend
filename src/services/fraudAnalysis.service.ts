import { Types } from "mongoose";
import { Transaction } from "../models/transaction.model";
import { RiskEngine } from "./riskEngine";
import { TransactionAuditService } from "./transactionAudit.service";
import { ISeller, Seller } from "../models/seller.model";

export class FraudAnalysisService {
  static async analyzeTransaction(transactionId: string) {
    const tx = await Transaction.findById(transactionId);
    if (!tx) throw new Error("Transação não encontrada.");

    const seller = await Seller.findById(tx.sellerId);
    if (!seller) throw new Error("Seller não encontrado.");

    const { flags, level } = RiskEngine.evaluate({
      amount: tx.amount,
      ip: tx.metadata?.ipAddress,
      seller,
    });

    // ✅ Mapeia status corretamente
    const auditStatus: "pending" | "approved" | "failed" | "blocked" | "waiting_payment" = 
      tx.status === "refunded" ? "blocked" : tx.status;

    await TransactionAuditService.log({
      transactionId: tx._id as unknown as Types.ObjectId,
      sellerId: seller._id as Types.ObjectId,
      userId: seller.userId,
      amount: tx.amount,
      method: tx.method,
      status: auditStatus,
      flags,
      kycStatus: seller.kycStatus,
      description: `Análise antifraude automática (${level})`,
    });

    return { transaction: tx, flags, level };
  }

  static async scanRecentTransactions() {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const txs = await Transaction.find({ createdAt: { $gte: since } });
    const results = [];

    for (const tx of txs) {
      try {
        const txId = (tx._id as Types.ObjectId).toString();
        const result = await this.analyzeTransaction(txId);
        if (result.level !== "low") results.push(result);
      } catch (err) {
        console.warn("⚠️ Falha ao analisar transação:", err);
      }
    }

    return results;
  }
}