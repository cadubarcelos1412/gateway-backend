// Tipos compartilhados da integração Zendry — sem dependência de banco de
// dados nem de framework, pra poder ser importado em qualquer projeto.

export type ZendryVerificationStatus = "approved" | "pending" | "rejected" | "cancelled";

// ── Pix ──────────────────────────────────────────────────────────────────

export interface CreatePixInput {
  /** Valor total em reais (ex.: 199.9) — convertido pra centavos internamente. */
  amountBRL: number;
  /** Nome de quem está pagando. */
  payerName: string;
  /** CPF ou CNPJ de quem está pagando, só dígitos. Opcional (a Zendry aceita sem). */
  payerDocument?: string;
  /** Referência sua (nº do pedido, por exemplo) — volta no webhook como external_reference. */
  externalReference: string;
  /** Segundos até expirar. Default 1800 (30min). */
  expirationSeconds?: number;
}

export interface CreatePixResult {
  /** Código identificador da cobrança na Zendry — salve isso pra casar com o webhook depois. */
  referenceCode: string;
  /** Código "copia e cola" do Pix. */
  pixCode: string;
  /** QR Code em base64 (sem o prefixo "data:image/png;base64,"). */
  qrCodeBase64: string;
}

// ── Cartão ───────────────────────────────────────────────────────────────

export type CardBrand = "VISA" | "MASTERCARD" | "ELO" | "AMEX";

// Dados devolvidos pelo SDK de 3DS (ZendrySDKThreeds.init_threeds, roda no
// navegador do cliente) — obrigatórios em todo pagamento de cartão, a Zendry
// recusa sem isso ("Threeds data is required", confirmado testando de verdade).
export interface ZendryThreedsData {
  operation_session_id: string;
  cavv: string;
  xid: string;
  eci: string;
  secure_version: string;
  directory_server_transaction_id: string;
  three_ds_server_transaction_id: string;
  ip_address: string;
  user_agent_browser_value: string;
  http_browser_language: string;
  http_browser_screen_height: string;
  http_browser_screen_width: string;
  zip_code: string;
}

export interface CreateCardPaymentInput {
  /** Referência sua (nº do pedido) — vai como external_id. */
  externalId: string;
  /** Valor total em reais (ex.: 199.9) — convertido pra centavos internamente. */
  amountBRL: number;
  cardNumber: string;
  /** Formato "MMyyyy", ex.: "122029". */
  cardExpirationDate: string;
  cardSecurityCode: string;
  cardHolderName: string;
  /** CPF do titular, só dígitos. */
  cardHolderDocument: string;
  /** 1 a 14 — ver CARD_INSTALLMENT_RATES em status-mapper.ts pra calcular o valor real por parcela. */
  installments: number;
  threedsData: ZendryThreedsData;
}

export interface CreateCardPaymentResult {
  /** ID da transação na Zendry (muid) — salve isso pra casar com o webhook depois. */
  muid: string;
  status: "accepted" | "reject" | "waiting_3ds_authentication" | string;
  lastDigits?: string;
  brand?: string;
  authorizationCode?: string;
}

// ── Webhook ──────────────────────────────────────────────────────────────

export type ZendryNotificationType = "pix_qrcode" | "card_payment" | "checkout";

export interface ZendryWebhookPayload {
  notification_type: ZendryNotificationType;
  message: Record<string, unknown>;
}
