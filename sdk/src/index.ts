/**
 * SDK oficial da PYX Gate — cliente da API pública /v1.
 *
 * Zero dependências: usa o `fetch` global (Node 18+) e o `crypto` do próprio
 * Node. Valores monetários são SEMPRE inteiros em centavos, igual à API.
 */
import crypto from "node:crypto";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "chargedback";
export type PaymentMethod = "pix" | "card" | "boleto";
export type Mode = "test" | "live";

export interface Customer {
  name: string;
  email?: string;
  /** CPF (11 dígitos) ou CNPJ (14), só números. */
  document?: string;
  /** Alternativa a email+document para Pix, se a conta tiver liberação. */
  phone?: string;
}

export interface Payment {
  id: string;
  object: "payment";
  /** Em centavos. */
  amount: number;
  fee: number;
  net_amount: number;
  currency: "BRL";
  status: PaymentStatus;
  payment_method: PaymentMethod;
  mode: Mode;
  customer?: Customer;
  metadata: Record<string, unknown>;
  /** Pix copia-e-cola (payload EMV). */
  qr_code?: string;
  qr_code_base64?: string;
  card?: { last4: string; brand?: string; authorization_code?: string };
  /** Unix timestamp em segundos. */
  created: number;
}

export interface CreatePaymentParams {
  /** Em centavos. Mínimo 500 (R$ 5,00) para Pix. */
  amount: number;
  payment_method: "pix" | "card";
  customer: Customer;
  description?: string;
  metadata?: Record<string, unknown>;
  card?: {
    number: string;
    holder_name: string;
    /** Formato "MMyyyy", ex.: "122029". */
    expiration_date: string;
    security_code: string;
    installments?: number;
  };
  /** Obrigatório para cartão — vem do desafio 3DS no navegador do comprador. */
  threeds_data?: Record<string, string>;
}

export interface ListPaymentsParams {
  status?: "pending" | "paid" | "failed" | "refunded";
  created_after?: string;
  created_before?: string;
  limit?: number;
  page?: number;
}

export interface Page<T> {
  object: "list";
  data: T[];
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active?: boolean;
  /** Devolvido só na criação. */
  secret?: string;
}

export interface WebhookEvent<T = Payment> {
  id: string;
  type: string;
  created: number;
  data: T;
}

export interface Account {
  id: string;
  name?: string;
  mode?: Mode;
  kyc_status?: string;
  [key: string]: unknown;
}

/** Erro da API, com o `code` estável do contrato público. */
export class PyxGateError extends Error {
  readonly type: string;
  readonly code: string;
  readonly param?: string;
  readonly status: number;

  constructor(status: number, body: { error?: { type?: string; code?: string; message?: string; param?: string } }) {
    super(body?.error?.message || `Erro HTTP ${status}`);
    this.name = "PyxGateError";
    this.status = status;
    this.type = body?.error?.type || "api_error";
    this.code = body?.error?.code || "unknown";
    this.param = body?.error?.param;
  }
}

export interface PyxGateOptions {
  /** Chave `sk_live_...`/`sk_test_...` ou um access token OAuth. */
  apiKey: string;
  /** Padrão: `PYXGATE_API_URL` do ambiente, ou a produção da PYX Gate. */
  baseUrl?: string;
  /** Timeout por requisição, em ms. Padrão 30000. */
  timeoutMs?: number;
  /** Tentativas extras em erro de rede ou 5xx. Padrão 2. */
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
}

/**
 * URL da API. O padrão é a produção atual; `PYXGATE_API_URL` sobrescreve sem
 * precisar republicar o pacote — importa porque o domínio ainda vai mudar
 * (hoje é o do provedor de hospedagem, não um domínio próprio).
 */
const DEFAULT_BASE_URL = "https://pyxgate-api.onrender.com";

function baseUrlPadrao(): string {
  return (typeof process !== "undefined" && process.env?.PYXGATE_API_URL) || DEFAULT_BASE_URL;
}

export class PyxGate {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: PyxGateOptions | string) {
    const opts = typeof options === "string" ? { apiKey: options } : options;
    if (!opts?.apiKey) throw new Error("PyxGate: apiKey é obrigatória.");

    this.#apiKey = opts.apiKey;
    this.#baseUrl = (opts.baseUrl || baseUrlPadrao()).replace(/\/$/, "");
    this.#timeoutMs = opts.timeoutMs ?? 30_000;
    this.#maxRetries = opts.maxRetries ?? 2;
    this.#fetch = opts.fetch ?? globalThis.fetch;

    if (!this.#fetch) throw new Error("PyxGate: fetch global indisponível. Use Node 18+ ou passe `fetch` nas options.");
  }

  async #request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; query?: Record<string, unknown>; idempotencyKey?: string } = {}
  ): Promise<T> {
    const url = new URL(`${this.#baseUrl}/v1${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = { Authorization: `Bearer ${this.#apiKey}` };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

      try {
        const res = await this.#fetch(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        });

        // 5xx e 429 são transitórios; 4xx é erro do chamador e não se repete.
        if ((res.status >= 500 || res.status === 429) && attempt < this.#maxRetries) {
          lastError = new PyxGateError(res.status, await res.json().catch(() => ({})));
          await sleep(200 * 2 ** attempt);
          continue;
        }

        const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
        if (!res.ok) throw new PyxGateError(res.status, json as never);
        return json as T;
      } catch (err) {
        if (err instanceof PyxGateError) throw err;
        lastError = err;
        // Erro de rede/timeout: repete enquanto houver tentativa sobrando.
        if (attempt < this.#maxRetries) {
          await sleep(200 * 2 ** attempt);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("PyxGate: falha na requisição.");
  }

  /* ------------------------------ Pagamentos ------------------------------ */

  readonly payments = {
    /**
     * Cria uma cobrança. Passe `idempotencyKey` (use o id do pedido) para que
     * um retry por timeout não gere cobrança duplicada.
     */
    create: (params: CreatePaymentParams, idempotencyKey?: string): Promise<Payment> =>
      this.#request<Payment>("POST", "/payments", { body: params, idempotencyKey }),

    retrieve: (id: string): Promise<Payment> => this.#request<Payment>("GET", `/payments/${id}`),

    list: (params: ListPaymentsParams = {}): Promise<Page<Payment>> =>
      this.#request<Page<Payment>>("GET", "/payments", { query: params as Record<string, unknown> }),
  };

  /* --------------------------- Modo teste --------------------------------- */

  readonly testPayments = {
    /** Só funciona com chave `sk_test_`. Dispara o webhook payment.paid. */
    pay: (id: string): Promise<Payment> => this.#request<Payment>("POST", `/test/payments/${id}/pay`),
    fail: (id: string): Promise<Payment> => this.#request<Payment>("POST", `/test/payments/${id}/fail`),
  };

  /* ------------------------------- Conta ---------------------------------- */

  readonly account = {
    retrieve: (): Promise<Account> => this.#request<Account>("GET", "/account"),
  };

  /* ------------------------------ Webhooks -------------------------------- */

  readonly webhookEndpoints = {
    create: (params: { url: string; events: string[] }): Promise<WebhookEndpoint> =>
      this.#request<WebhookEndpoint>("POST", "/webhook_endpoints", { body: params }),

    list: (): Promise<Page<WebhookEndpoint>> => this.#request<Page<WebhookEndpoint>>("GET", "/webhook_endpoints"),

    update: (id: string, params: { url?: string; events?: string[]; active?: boolean }): Promise<WebhookEndpoint> =>
      this.#request<WebhookEndpoint>("PATCH", `/webhook_endpoints/${id}`, { body: params }),

    del: (id: string): Promise<void> => this.#request<void>("DELETE", `/webhook_endpoints/${id}`),
  };
}

/* -------------------------------------------------------------------------- */
/* 🔐 Verificação de webhook                                                  */
/* -------------------------------------------------------------------------- */

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/**
 * Verifica a assinatura de um webhook e devolve o evento já parseado.
 *
 * ⚠️ `rawBody` precisa ser o corpo **cru** da requisição (string ou Buffer),
 * exatamente como chegou. Se você passar `JSON.stringify(req.body)`, a
 * assinatura NÃO vai bater: a reserialização muda espaçamento e ordem de
 * chaves. No Express, use `express.json({ verify: (req, _res, buf) => { req.rawBody = buf } })`.
 *
 * O header vem como `PYX-Signature: t=<unix>,v1=<hmac hex>`, e a assinatura é
 * HMAC-SHA256 de `${t}.${rawBody}` com o secret do endpoint.
 *
 * @param toleranceSeconds Janela aceita para o timestamp (padrão 300s). Protege
 * contra replay de um payload legítimo capturado. Passe 0 para desligar.
 */
export function constructWebhookEvent<T = Payment>(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret: string,
  toleranceSeconds = 300
): WebhookEvent<T> {
  if (!signatureHeader) throw new WebhookSignatureError("Header PYX-Signature ausente.");

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );

  const timestamp = Number(parts.t);
  const received = parts.v1;
  if (!timestamp || !received) throw new WebhookSignatureError("Header PYX-Signature malformado.");

  if (toleranceSeconds > 0) {
    const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
    if (age > toleranceSeconds) {
      throw new WebhookSignatureError(`Timestamp fora da janela de ${toleranceSeconds}s (diferença: ${age}s).`);
    }
  }

  const payload = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

  // Comparação em tempo constante — `===` vazaria informação por timing.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new WebhookSignatureError("Assinatura inválida.");
  }

  return JSON.parse(payload) as WebhookEvent<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default PyxGate;
