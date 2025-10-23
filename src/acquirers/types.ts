// src/acquirers/types.ts
// Tipos compartilhados entre todos os adaptadores de adquirentes

export type PaymentMethod = "pix" | "credit_card" | "boleto";

/**
 * Nome lógico da adquirente.
 * Adicione aqui quando criar novos adaptadores (ex: "getnet", "cielo").
 */
export type AcquirerName = "pagarme" | "stripe";

/**
 * Payload mínimo para criar uma transação em qualquer adquirente
 */
export type CreateTransactionDTO = {
  amount: number;              // 💰 em reais
  currency: "brl";
  method: PaymentMethod;
  description: string;         // deixar como string obrigatória para evitar erros de TS
  idempotencyKey?: string | null;

  product: {
    id: string;
    name: string;
    price?: number;
  };

  customer: {
    name: string;
    email: string;
    document: string;
    phone?: string;
    ip?: string;
  };

  postbackUrl?: string;        // usado por adquirentes que enviam webhooks para seu sistema
  metadata?: Record<string, any>;
};

export type CreateTransactionResult = {
  externalId: string;
  postbackUrl?: string;
  raw?: any;                   // 🔎 payload bruto da adquirente (útil pra debug e auditoria)
};

/**
 * Contrato que TODO adaptador de adquirente deve cumprir
 */
export interface AcquirerAdapter {
  /** Nome único da adquirente (exato ao AcquirerName) */
  name: AcquirerName;

  /**
   * Cria uma transação/autorização de pagamento na adquirente.
   * Deve retornar pelo menos um externalId (id da adquirente).
   */
  createTransaction(data: CreateTransactionDTO): Promise<CreateTransactionResult>;
}
