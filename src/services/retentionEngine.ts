// src/services/retentionEngine.ts
import { RetentionPolicy } from "../models/retentionPolicy.model";
import { round } from "../utils/fees";
import { RiskLevel } from "./riskEngine";

export type PaymentMethod = "pix" | "credit_card" | "boleto";

interface RetentionInput {
  method: PaymentMethod;
  netAmount: number;
  riskLevel: RiskLevel;
  /** Dias de liquidação vindos do feeTable do seller (ex.: 30) — sobrepõe o fallback padrão por método. */
  settlementDaysOverride?: number;
}

/* -------------------------------------------------------------------------- */
/* 📊 RetentionEngine – Governança de retenção por política e risco           */
/* -------------------------------------------------------------------------- */
export class RetentionEngine {
  /**
   * Calcula retenção financeira, percentual aplicado e data de liberação.
   * Baseia-se na política ativa e no nível de risco calculado.
   */
  static async calculate({ method, netAmount, riskLevel, settlementDaysOverride }: RetentionInput) {
    const policy = await RetentionPolicy.findOne({
      method,
      riskLevel,
      active: true,
    }).lean();

    // 🧮 Percentual aplicado pela política
    const percentage = policy?.percentage || 0;
    const retentionAmount = round(netAmount * (percentage / 100));

    // 📅 Dias de retenção — feeTable.settlementDays do seller tem prioridade
    // sobre a política de risco (que continua controlando só o "quanto retém a mais").
    const fallbackDays = method === "pix" ? 0 : method === "boleto" ? 3 : 15;
    const days = settlementDaysOverride ?? policy?.days ?? fallbackDays;

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
