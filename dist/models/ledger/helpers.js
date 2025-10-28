"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.round2 = round2;
exports.validateAndNormalizeEntries = validateAndNormalizeEntries;
/**
 * Arredonda para 2 casas (em reais). Mantém coerência em todos os lançamentos.
 */
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
/**
 * Garante que todos os amounts estão com 2 casas e que o batch está balanceado.
 * Lança erro se ∑débitos ≠ ∑créditos.
 */
function validateAndNormalizeEntries(entries) {
    if (!Array.isArray(entries) || entries.length < 2) {
        throw new Error("Batch contábil inválido: mínimo de 2 lançamentos (debit + credit).");
    }
    const normalized = entries.map((e) => ({
        ...e,
        currency: e.currency || "BRL",
        amount: round2(e.amount),
    }));
    const debitSum = round2(normalized.filter((e) => e.type === "debit").reduce((acc, e) => acc + e.amount, 0));
    const creditSum = round2(normalized.filter((e) => e.type === "credit").reduce((acc, e) => acc + e.amount, 0));
    if (debitSum !== creditSum) {
        throw new Error(`Lançamentos desbalanceados: Débito=${debitSum} ≠ Crédito=${creditSum}`);
    }
    return normalized;
}
