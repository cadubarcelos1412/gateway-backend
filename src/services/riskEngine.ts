// src/services/riskEngine.ts
import { ISeller } from "../models/seller.model";

export type RiskFlag =
  | "HIGH_AMOUNT"      // 💰 Valor acima do limite seguro
  | "FOREIGN_IP"       // 🌍 Origem suspeita (fora do Brasil)
  | "NO_KYC"           // 🚫 KYC não aprovado
  | "UNKNOWN_DEVICE"   // 🖥️ Dispositivo não reconhecido
  | "FAILED_ATTEMPT";  // ❌ Tentativa de fraude anterior

export type RiskLevel = "low" | "medium" | "high";

interface RiskInput {
  amount: number;
  ip?: string;
  seller: ISeller;
  maxAmount?: number;
  trustedIpPrefixes?: string[]; // ✅ permite configurar ranges confiáveis no .env
}

/* -------------------------------------------------------------------------- */
/* 🧠 RiskEngine – Avaliação de risco e flags                                 */
/* -------------------------------------------------------------------------- */
export class RiskEngine {
  /**
   * Avalia a transação e retorna flags e nível de risco.
   * Modular, extensível e pronta para machine learning no futuro.
   */
  static evaluate(input: RiskInput): { flags: RiskFlag[]; level: RiskLevel } {
    const {
      amount,
      ip = "",
      seller,
      maxAmount = Number(process.env.MAX_TRANSACTION_AMOUNT || 50000),
      trustedIpPrefixes = (process.env.TRUSTED_IP_PREFIXES || "177.,201.").split(","),
    } = input;

    const flags: RiskFlag[] = [];

    // 💰 Flag: Valor muito alto
    if (amount > maxAmount) flags.push("HIGH_AMOUNT");

    // 🌍 Flag: IP suspeito (fora dos ranges confiáveis)
    const isTrustedIp = trustedIpPrefixes.some(prefix => ip.startsWith(prefix));
    if (ip && !isTrustedIp) flags.push("FOREIGN_IP");

    // 🚫 Flag: Seller sem KYC
    if (seller.kycStatus !== "approved" || seller.status !== "active") flags.push("NO_KYC");

    // 🧠 Futuro: fingerprint de device pode ser analisado aqui
    // if (detectUnknownDevice(...)) flags.push("UNKNOWN_DEVICE");

    // 📊 Cálculo do nível de risco geral
    const level: RiskLevel = flags.includes("HIGH_AMOUNT") || flags.includes("NO_KYC")
      ? "high"
      : flags.includes("FOREIGN_IP")
      ? "medium"
      : "low";

    return { flags, level };
  }
}
