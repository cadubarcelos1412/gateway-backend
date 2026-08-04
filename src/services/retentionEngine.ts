// src/services/retentionEngine.ts
import { RetentionPolicy } from "../models/retentionPolicy.model";
import { round } from "../utils/fees";
import { RiskLevel } from "./riskEngine";

export type PaymentMethod = "pix" | "credit_card" | "boleto";

interface RetentionInput {
  method: PaymentMethod;
  netAmount: number;
  riskLevel: RiskLevel;
}

/* -------------------------------------------------------------------------- */
/* 📊 RetentionEngine – Governança de retenção por política e risco           */
/* -------------------------------------------------------------------------- */
export class RetentionEngine {
  /**
   * Calcula retenção financeira, percentual aplicado e data de liberação.
   * Baseia-se na política ativa e no nível de risco calculado.
   */
  static async calculate({ method, netAmount, riskLevel }: RetentionInput) {
    const policy = await RetentionPolicy.findOne({
      method,
      riskLevel,
      active: true,
    }).lean();

    // 🧮 Percentual aplicado pela política
    const percentage = policy?.percentage || 0;
    const retentionAmount = round(netAmount * (percentage / 100));

    // 📅 Dias de retenção com fallback seguro por método
    const fallbackDays = method === "pix" ? 0 : method === "boleto" ? 3 : 15;
    const days = policy?.days ?? fallbackDays;

    const availableIn = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    return {
      retentionAmount,
      percentage,
      availableIn,
      days,
      policyId: policy?._id || null,
      policyDescription: policy?.description || "Retenção padrão aplicada",
    };
  }
}
