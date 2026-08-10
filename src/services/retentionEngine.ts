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
    let days = settlementDaysOverride ?? policy?.days ?? fallbackDays;

    // 🚨 Invariante de negócio, não ajustável por política de risco: Pix
    // liquida D+0 de verdade na Zendry (o dinheiro já caiu na nossa conta na
    // hora), então nunca pode ficar "preso" esperando data — isso já
    // aconteceu em produção em 2026-08-09 porque a RetentionPolicy seedada
    // pra risco médio/alto tinha days:1/3, sobrepondo o fallback de 0 aqui
    // em cima. O percentual de retenção por risco (fraude) continua valendo
    // normalmente — só o prazo é travado em 0 pra esse método.
    if (method === "pix") days = 0;

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
