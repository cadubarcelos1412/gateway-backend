"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskEngine = void 0;
/* -------------------------------------------------------------------------- */
/* 🧠 RiskEngine – Avaliação de risco e flags                                 */
/* -------------------------------------------------------------------------- */
class RiskEngine {
    /**
     * Avalia a transação e retorna flags e nível de risco.
     * Modular, extensível e pronta para machine learning no futuro.
     */
    static evaluate(input) {
        const { amount, ip = "", seller, maxAmount = Number(process.env.MAX_TRANSACTION_AMOUNT || 50000), trustedIpPrefixes = (process.env.TRUSTED_IP_PREFIXES || "177.,201.").split(","), } = input;
        const flags = [];
        // 💰 Flag: Valor muito alto
        if (amount > maxAmount)
            flags.push("HIGH_AMOUNT");
        // 🌍 Flag: IP suspeito (fora dos ranges confiáveis)
        const isTrustedIp = trustedIpPrefixes.some(prefix => ip.startsWith(prefix));
        if (ip && !isTrustedIp)
            flags.push("FOREIGN_IP");
        // 🚫 Flag: Seller sem KYC
        if (seller.kycStatus !== "approved" || seller.status !== "active")
            flags.push("NO_KYC");
        // 🧠 Futuro: fingerprint de device pode ser analisado aqui
        // if (detectUnknownDevice(...)) flags.push("UNKNOWN_DEVICE");
        // 📊 Cálculo do nível de risco geral
        const level = flags.includes("HIGH_AMOUNT") || flags.includes("NO_KYC")
            ? "high"
            : flags.includes("FOREIGN_IP")
                ? "medium"
                : "low";
        return { flags, level };
    }
}
exports.RiskEngine = RiskEngine;
