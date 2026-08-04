// src/ledger/factories/sale.factory.ts
import { LedgerPostEntry } from "../types";
import { validateAndNormalizeEntries } from "../helpers";

/**
 * Monta as 3 entradas padrão de uma venda (double-entry).
 */
export function buildSaleEntries(amount: number, fee: number): LedgerPostEntry[] {
  const net = Math.max(0, amount - fee);

  const entries: LedgerPostEntry[] = [
    { account: "contas_a_receber_adquirente", type: "debit", amount },
    { account: "passivo_seller",              type: "credit", amount: net },
    { account: "receita_taxa_kissa",          type: "credit", amount: fee },
  ];

  return validateAndNormalizeEntries(entries);
}
