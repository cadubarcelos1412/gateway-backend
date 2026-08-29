// src/acquirers/types.ts
// Tipos compartilhados entre todos os adaptadores de adquirentes

export type PaymentMethod = "pix" | "credit_card" | "boleto";

/**
 * Nome lógico da adquirente.
 * Adicione aqui quando criar novos adaptadores (ex: "getnet", "cielo").
 */
export type AcquirerName = "zendry" | "sttart";

/* -------------------------------------------------------------------------- */
/* 🏦 Adquirente por método (2026-08-30) — ver resolveSellerAcquirer          */
/* -------------------------------------------------------------------------- */

export type AcquirerCapability = "pix" | "card" | "swap";

/** Forma mínima que `resolveSellerAcquirer` precisa de um Seller — não
 * importa `ISeller` de propósito, pra ficar uma função pura, fácil de
 * testar com objeto literal, sem precisar de Mongoose/banco. */
export interface SellerAcquirerShape {
  acquirer?: AcquirerName;
  acquirerConfig?: {
    pix?: AcquirerName | null;
    card?: AcquirerName | null;
    swap?: AcquirerName | null;
  };
}

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
   * true quando a adquirente já confirmou a aprovação de forma SÍNCRONA
   * nesta mesma chamada (sem depender de webhook/reconciliação depois) —
   * ex.: cartão via Zendry, onde `createTransaction` só retorna sem lançar
   * erro se o resultado já veio "accepted". Quando true, quem chama deve
   * aplicar o status "approved" (ledger/wallet) logo após criar a
   * transação, em vez de deixar como "pending" esperando confirmação
   * assíncrona que nunca vai chegar.
   */
  synchronouslyApproved?: boolean;

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

/* -------------------------------------------------------------------------- */
/* 💸 Saque (cash-out) — moldado no formato que lib/zendry/pixPayout.ts já    */
/* usa, pra ZendryAcquirer virar um wrapper fino sem mudar comportamento.    */
/* -------------------------------------------------------------------------- */

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

export type SendPayoutInput = {
  /** Id do nosso lado (CashoutRequest) — usado como chave de idempotência na adquirente. */
  idempotentId: string;
  pixKeyType: PixKeyType;
  pixKey: string;
  receiverName?: string;
  receiverDocument?: string;
  valueCents: number;
};

export type SendPayoutResult = {
  externalReference: string;
  status: string;
};

export type PayoutStatusResult = {
  externalReference: string;
  status: string;
};

/* -------------------------------------------------------------------------- */
/* 🔄 Swap pra stablecoin (USDT) — cobre cotação + envio numa única chamada. */
/* Cada adapter decide por dentro como cotar+enviar (Zendry: wallet-tesouro  */
/* pré-financiada; Sttart: compra de verdade a cada saque via quotationId). */
/* -------------------------------------------------------------------------- */

export type SwapInput = {
  /** Id do nosso lado (CashoutRequest) — usado como chave de idempotência na adquirente. */
  idempotentId: string;
  /** Valor em BRL já líquido (depois da taxa) que deve virar USDT. */
  netAmountBRL: number;
  /** Endereço da carteira USDT de destino informado pelo seller. */
  destinationAddress: string;
};

export type SwapResult = {
  externalReference: string;
  status: string;
  usdtAmount: number;
  /** Preço de 1 USDT em BRL usado nessa operação — pra auditoria/exibição. */
  quotedBrlPrice: number;
};
