// src/ledger/chart.ts
import { LedgerAccount } from "./types";

/**
 * Plano de contas mínimo.
 * Descrição e natureza são úteis para relatórios e validação.
 */
export const CHART_OF_ACCOUNTS: Record<
  LedgerAccount,
  { desc: string; nature: "asset" | "liability" | "equity" | "revenue" | "expense" }
> = {
  contas_a_receber_adquirente: {
    desc: "Valores a receber da adquirente (D+N, PIX, boletos)",
    nature: "asset",
  },
  passivo_seller: {
    desc: "Obrigações com o seller (saldo a pagar)",
    nature: "liability",
  },
  receita_taxa_kissa: {
    desc: "Receita de taxa (fees Kissa)",
    nature: "revenue",
  },
  conta_liquidacao: {
    desc: "Conta de liquidação bancária (caixa/banco)",
    nature: "asset",
  },
  reserva_risco: {
    desc: "Reserva de risco para chargebacks e contingências",
    nature: "liability",
  },
  ajustes_a_pagar: {
    desc: "Ajustes/estornos pendentes a pagar",
    nature: "liability",
  },
  custo_adquirente: {
    desc: "Custos pagos à adquirente (MDR, tarifas, etc.)",
    nature: "expense",
  },
};
