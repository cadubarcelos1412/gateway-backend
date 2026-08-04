// src/acquirers/types.ts
// Tipos compartilhados entre todos os adaptadores de adquirentes

export type PaymentMethod = "pix" | "credit_card" | "boleto";

/**
 * Nome lógico da adquirente.
 * Adicione aqui quando criar novos adaptadores (ex: "getnet", "cielo").
 */
export type AcquirerName = "pagarme" | "zendry";

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

  /**
   * Dados de cartão — só usado quando method === "credit_card" e a
   * adquirente exige o número/CVV diretamente (ex: Zendry, modelo
   * "adquirente direto"). Nunca logar/persistir number/securityCode fora
   * deste DTO efêmero.
   */
  card?: {
    number: string;
    holderName: string;
    /** Formato "MMyyyy", ex.: "122029". */
    expirationDate: string;
    securityCode: string;
    installments: number;
  };

  /**
   * Bag genérico pros dados de autenticação 3DS calculados no navegador
   * (formato específico de cada adquirente — quem valida o shape exato é
   * o próprio adapter, não este contrato compartilhado).
   */
  threedsData?: Record<string, string>;
};

export type CreateTransactionResult = {
  externalId: string;
  postbackUrl?: string;

  /**
   * Dados seguros de exibição/reconciliação devolvidos pela adquirente —
   * nunca incluir aqui dados sensíveis de cartão (número/CVV/threeds bruto).
   */
  paymentDetails?: {
    pixCode?: string;
    pixQrCodeBase64?: string;
    cardLastDigits?: string;
    cardBrand?: string;
    cardAuthorizationCode?: string;
    /** Total realmente cobrado no cartão (base + sobretaxa de parcela), em reais. */
    cardChargedAmount?: number;
  };

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
