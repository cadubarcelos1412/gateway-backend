import { Types } from "mongoose";
import { TransactionAudit } from "../models/transactionAudit.model";
import { RiskFlag, RiskLevel } from "./riskEngine";

export interface AuditData {
  transactionId?: Types.ObjectId | null;
  sellerId: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  method: "pix" | "credit_card" | "boleto" | "debit_card"; // ✅ Adicionado debit_card
  status: "pending" | "approved" | "failed" | "blocked" | "waiting_payment"; // ✅ Adicionado waiting_payment
  kycStatus: string;
  ipAddress?: string;
  userAgent?: string;
  buyerDocument?: string;
  flags: RiskFlag[];
  description?: string;
  riskLevel?: RiskLevel;
  riskScore?: number;
  retentionAmount?: number;
  retentionDays?: number;
}

export class TransactionAuditService {
  /**
   * 🧾 Cria um registro de auditoria detalhado da transação
   */
  static async log(data: AuditData) {
    const riskScore =
      data.riskScore ??
      (data.riskLevel === "high" ? 90 : data.riskLevel === "medium" ? 60 : 30);

    return await TransactionAudit.create({
      transactionId: data.transactionId || null,
      sellerId: data.sellerId,
      userId: data.userId,
      amount: data.amount,
      method: data.method,
      status: data.status,
      description: data.description || "Auditoria registrada.",
      kycStatus: data.kycStatus,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      buyerDocument: data.buyerDocument,
      flags: data.flags,
      riskScore,
      retentionAmount: data.retentionAmount || 0,
      retentionDays: data.retentionDays || 0,
      createdAt: new Date(),
    });
  }

  /**
   * 📊 Busca tentativas anteriores
   */
  static async getHistoricalAttempts(
    buyerDocument?: string,
    ipAddress?: string
  ) {
    const query: Record<string, any> = {};
    if (buyerDocument) query.buyerDocument = buyerDocument;
    if (ipAddress) query.ipAddress = ipAddress;

    return await TransactionAudit.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }
}