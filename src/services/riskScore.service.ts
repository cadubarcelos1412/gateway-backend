import { Transaction } from "../models/transaction.model";
import { ISeller, Seller } from "../models/seller.model";

/**
 * 📊 RiskScoreService
 * - Calcula pontuação de risco dinâmica (0–100)
 * - Baseia-se em histórico de transações e flags
 */
export class RiskScoreService {
  static async calculateSellerScore(seller: ISeller): Promise<number> {
    const txs = await Transaction.find({ sellerId: seller._id });
    if (txs.length === 0) return 100;

    const total = txs.length;
    const failed = txs.filter((t) => t.status === "failed").length;
    const highRisk = txs.filter((t) => t.flags?.includes("HIGH_AMOUNT")).length;
    const foreignIp = txs.filter((t) => t.flags?.includes("FOREIGN_IP")).length;

    const failureRate = failed / total;
    const riskWeight = (highRisk * 2 + foreignIp) / total;

    const score = Math.max(0, 100 - (failureRate * 40 + riskWeight * 60) * 100);
    return Math.round(score);
  }

  static async getTransactionScore(transactionId: string): Promise<number> {
    const tx = await Transaction.findById(transactionId);
    if (!tx) throw new Error("Transação não encontrada.");

    const seller = await Seller.findById(tx.sellerId);
    if (!seller) throw new Error("Seller não encontrado.");

    const sellerScore = await this.calculateSellerScore(seller);

    let penalty = 0;
    if (tx.amount > 10000) penalty += 10;
    if (tx.flags?.includes("FOREIGN_IP")) penalty += 5;

    return Math.max(0, sellerScore - penalty);
  }
}
