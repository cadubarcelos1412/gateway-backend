// Cartão pela API NATIVA da Zendry (finance.zendry.co), autenticada por chave
// Bearer (gw_...), e não pelo OAuth da API Legada (api.zendry.co).
//
// Por que existe: na API Legada o 3DS do navegador foi aposentado — o SDK
// (cdn.zendry.com) aponta pra api.zendry.com, que recusa o token novo com 401,
// e a rota /v1/card_payments/threeds responde 404 no domínio novo. Sem 3DS, a
// Legada recusa a cobrança com "Esta operação não é permitida para este
// cartão", localmente, sem sequer consultar o emissor (confirmado: o banco do
// portador não registra nem tentativa). A API Nativa tem o fluxo documentado:
// a cobrança sai do servidor e, quando o emissor exige autenticação, a
// resposta volta com state "requires_action" pro navegador concluir.
//
// Pix continua na Legada, intocado.

const DEFAULT_BASE_URL = "https://finance.zendry.co/api/public/v1";

export function isNativeCardEnabled(): boolean {
  return Boolean(process.env.ZENDRY_NATIVE_API_KEY);
}

function nativeConfig(): { baseUrl: string; apiKey: string } {
  const apiKey = process.env.ZENDRY_NATIVE_API_KEY;
  if (!apiKey) {
    throw new Error("ZENDRY_NATIVE_API_KEY não configurada.");
  }
  return { baseUrl: process.env.ZENDRY_NATIVE_BASE_URL || DEFAULT_BASE_URL, apiKey };
}

export type NativeCardState = "approved" | "declined" | "refunded" | "requires_action";

export type CreateNativeCardPaymentInput = {
  externalId: string;
  /** Reais — convertido pra centavos aqui. */
  amountBRL: number;
  installments: number;
  buyer: { name: string; email: string; taxpayerId: string };
  card: {
    holderName: string;
    number: string;
    /** "MMyyyy" — quebrado em mês/ano aqui, que é o formato da API nativa. */
    expirationDate: string;
    securityCode: string;
  };
  device?: { language: string; screenHeight: number; screenWidth: number; timeZoneOffset: number };
  ipAddress?: string;
  userAgent?: string;
};

export type NativeCardPaymentResult = {
  id: string;
  chargeId: string | null;
  state: NativeCardState;
  failureReason: string | null;
  /** Presente quando state = requires_action: o desafio a concluir no navegador. */
  action: unknown;
};

type NativeCardResponse = {
  id: string;
  charge_id?: string | null;
  state: NativeCardState;
  failure_reason?: string | null;
  action?: unknown;
};

/**
 * POST /card_payments. Recusa NÃO é erro HTTP: volta 200 com state
 * "declined" e failure_reason legível. Erro de negócio vem como 422
 * { error, error_type, error_code, retry }.
 *
 * Nunca logar o corpo da requisição: ele carrega número e CVV.
 */
export async function createNativeCardPayment(
  input: CreateNativeCardPaymentInput,
): Promise<NativeCardPaymentResult> {
  const { baseUrl, apiKey } = nativeConfig();
  const digits = input.card.expirationDate.replace(/\D/g, "");
  const expirationMonth = digits.slice(0, 2);
  const expirationYear = digits.length > 4 ? digits.slice(2) : `20${digits.slice(2)}`;

  const response = await fetch(`${baseUrl}/card_payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount_cents: Math.round(input.amountBRL * 100),
      installments: input.installments,
      external_id: input.externalId,
      buyer: {
        name: input.buyer.name,
        email: input.buyer.email,
        taxpayer_id: input.buyer.taxpayerId.replace(/\D/g, ""),
      },
      card: {
        holder_name: input.card.holderName.trim(),
        number: input.card.number.replace(/\D/g, ""),
        expiration_month: expirationMonth,
        expiration_year: expirationYear,
        security_code: input.card.securityCode,
      },
      device: input.device && {
        language: input.device.language,
        screen_height: input.device.screenHeight,
        screen_width: input.device.screenWidth,
        time_zone_offset: input.device.timeZoneOffset,
      },
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
    }),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Zendry (nativa) POST /card_payments: resposta não-JSON (${response.status})`);
  }

  if (!response.ok) {
    const err = body as { error?: string; error_code?: string; code?: string };
    throw new Error(
      `Zendry (nativa) POST /card_payments falhou (${response.status}): ${JSON.stringify({
        error: err?.error,
        code: err?.error_code ?? err?.code,
      })}`,
    );
  }

  const raw = body as NativeCardResponse;
  return {
    id: raw.id,
    chargeId: raw.charge_id ?? null,
    state: raw.state,
    failureReason: raw.failure_reason ?? null,
    action: raw.action ?? null,
  };
}
