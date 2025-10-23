// src/config/ledger-accounts.ts

export const LEDGER_ACCOUNTS = {
  // 🔹 Ativos
  CONTA_CORRENTE: "conta_corrente_bancaria",

  // 🔹 Passivos
  PASSIVO_SELLER: "passivo_seller",
  RESERVA_RISCO: "reserva_risco",
  AJUSTES_A_PAGAR: "ajustes_a_pagar",

  // 🔹 Receita / Despesa (opcional para relatórios futuros)
  TAXAS_RECEBIDAS: "taxas_recebidas",
  TAXAS_PAGAS: "taxas_pagas",
} as const;

export type LedgerAccount = keyof typeof LEDGER_ACCOUNTS;
