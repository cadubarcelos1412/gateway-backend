// src/acquirers/types.ts
/* -------------------------------------------------------------------------- */
/* 📦 Tipos globais usados por todos os adquirentes                           */
/* -------------------------------------------------------------------------- */

/**
 * Métodos de pagamento suportados pelos adquirentes.
 */
export type PaymentMethod =
  | "credit_card"
  | "pix"
  | "boleto"
  | "debit_card"
  | "wallet";

/**
 * DTO de criação de transação genérica — usado por todos os adapters.
 */
export interface CreateTransactionDTO {
  amount: number; // valor bruto da venda
  currency?: string; // ex: "brl"
  method?: PaymentMethod; // ex: "credit_card" | "pix"
  description?: string; // descrição da compra
  customer: {
    name: string;
    email: string;
    document?: string;
    phone?: string;
  };
  metadata?: Record<string, any>;
  postbackUrl?: string; // para Pagar.me, opcional
}

/**
 * Resultado padronizado do adapter de adquirente.
 */
export interface CreateTransactionResult {
  externalId: string; // ID da adquirente (ex: pi_123)
  acquirer: string; // nome do acquirer (ex: "stripe", "pagarme")
  rawResponse: any; // resposta completa da API
  status?: "pending" | "approved" | "failed"; // status padronizado
  postbackUrl?: string; // compatível com Pagar.me
}
