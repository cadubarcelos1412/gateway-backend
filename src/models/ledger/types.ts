// src/ledger/types.ts

export type Currency = "BRL";
export type LedgerSide = "debit" | "credit";

/**
 * Contas válidas do nosso razão (chart of accounts).
 * Mantemos como union type para ganhar autocomplete e segurança de tipo.
 */
export type LedgerAccount =
  | "contas_a_receber_adquirente"  // Ativo
  | "passivo_seller"               // Passivo (obrigações com o seller)
  | "receita_taxa_kissa"           // Receita (fees)
  | "conta_liquidacao"             // Caixa/Banco de liquidação
  | "reserva_risco"                // Reserva para chargebacks
  | "ajustes_a_pagar"              // Ajustes/estornos a pagar
  | "custo_adquirente";            // Custo (tarifas da adquirente)

/**
 * Entrada contábil “crua” usada nos serviços para registrar dupla-entrada.
 */
export interface LedgerPostEntry {
  account: LedgerAccount;
  type: LedgerSide;
  amount: number;        // mantemos BRL em "reais" (com arredondamento a 2 casas no helper)
  currency?: Currency;   // default "BRL"
}
