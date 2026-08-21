import crypto from "crypto";
import type { ZendryWebhookPayload, ZendryNotificationType } from "./types";
import { mapZendryStatus } from "./status-mapper";

// ============================================================================
// AUTENTICIDADE DO WEBHOOK — DOIS MECANISMOS POSSÍVEIS, LEIA ANTES DE MIGRAR
// ============================================================================
//
// 1) MECANISMO REALMENTE USADO no projeto de origem (comprovado funcionando
//    em produção): um segredo GERADO POR NÓS (não pela Zendry), embutido
//    como query param `?key=...` na URL de callback que foi registrada
//    manualmente na conta Zendry (fora do código — não há chamada no projeto
//    que faça esse registro). `verifyWebhookSecret()` abaixo implementa essa
//    checagem.
//
// 2) MECANISMO OFICIAL DOCUMENTADO, mas NÃO confirmado como configurado
//    nesta conta: ao registrar um webhook via `POST /v1/webhooks/{tipo}`
//    (body: `{ url, authorization }`), a Zendry passa a enviar esse valor de
//    volta no header `Authorization` de toda chamada ao seu endpoint — um
//    mecanismo mais forte que embutir segredo na URL. Uma tentativa de
//    consultar `GET /v1/webhooks` (pra ver o que está registrado hoje)
//    retornou HTTP 500 durante esta auditoria — não foi possível confirmar
//    se esse mecanismo está ativo pra esta conta. `verifyWebhookHeader()`
//    abaixo implementa a checagem, mas SÓ funciona se você re-registrar o
//    webhook com um valor de `authorization` (ver ZENDRY-MIGRATION.md).
//
// Recomendação pro projeto novo: prefira (2) — é o mecanismo oficial. Use
// (1) apenas se replicar exatamente o comportamento do projeto de origem.
// ============================================================================

export function verifyWebhookSecret(providedKey: string | null, expectedSecret: string): boolean {
  return !!providedKey && providedKey === expectedSecret;
}

export function verifyWebhookHeader(authorizationHeader: string | null, expectedValue: string): boolean {
  return !!authorizationHeader && authorizationHeader === expectedValue;
}

// ============================================================================
// MECANISMO 3 — assinatura HMAC-SHA256, painel novo da Zendry (2026-08).
// ============================================================================
//
// O painel novo (tanto modo "Nativo" quanto "Legado") exige registrar a URL
// do webhook e assina cada chamada com HMAC-SHA256 usando o "Segredo de
// assinatura" mostrado lá (ZENDRY_HMAC_WEBHOOK_SECRET) — não existe mais a
// opção de só validar por `?key=` na query, como no mecanismo 1 acima.
//
// Header confirmado ao vivo em produção em 2026-08-21: `x-zendry-signature`,
// formato `sha256=<hex>` (ver verifyWebhookHmacSignature). Testado com um
// Pix real pago de ponta a ponta — assinatura bateu, transação aprovada
// via webhook em ~30s sem precisar do polling de reconciliação.
const HMAC_SIGNATURE_HEADERS = ["x-zendry-signature"];

export function findWebhookSignatureHeader(
  headers: Record<string, unknown>
): { header: string; value: string } | null {
  for (const name of HMAC_SIGNATURE_HEADERS) {
    const value = headers[name];
    if (typeof value === "string" && value.length > 0) {
      return { header: name, value };
    }
  }
  return null;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// `rawBody` precisa ser os bytes exatos recebidos (ver server.ts, verify()
// do express.json) — recalcular em cima de JSON.stringify(req.body) não bate
// byte a byte com o que a Zendry assinou (ordem de chave, espaçamento etc.).
export function verifyWebhookHmacSignature(
  rawBody: Buffer,
  providedSignature: string,
  secret: string
): boolean {
  const expectedHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBase64 = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

  const cleaned = providedSignature.trim().replace(/^sha256=/i, "");

  return timingSafeEqualStrings(cleaned, expectedHex) || timingSafeEqualStrings(cleaned, expectedBase64);
}

export interface ParsedZendryWebhook {
  notificationType: ZendryNotificationType;
  /** payments.external_id equivalente: reference_code (Pix/checkout) ou muid (cartão). */
  externalId: string;
  status: ReturnType<typeof mapZendryStatus>;
  rawStatus: string | undefined;
  paidAt: string | undefined;
  raw: ZendryWebhookPayload;
}

// Extrai os campos que importam de um payload de webhook já autenticado
// (chame verifyWebhookSecret/verifyWebhookHeader ANTES desta função). Retorna
// null quando o payload não tem o formato esperado ou não tem identificador
// — nesses casos, responda 200 e não faça nada (não é um erro de
// processamento, é um evento que não reconhecemos ou não nos interessa).
export function parseZendryWebhook(payload: unknown): ParsedZendryWebhook | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;

  const notificationType = body.notification_type as ZendryNotificationType | undefined;
  const message = body.message as Record<string, unknown> | undefined;
  if (!notificationType || !message) return null;

  // O campo que identifica o pagamento varia por tipo: Pix/checkout usam
  // reference_code, cartão usa muid (é o que a resposta síncrona de
  // createCardPayment já devolve como `muid` — salve isso no seu banco na
  // hora de criar a transação, pra casar aqui depois).
  const externalId =
    notificationType === "card_payment"
      ? (message.muid as string | undefined)
      : (message.reference_code as string | undefined);
  if (!externalId) return null;

  const rawStatus = message.status as string | undefined;

  return {
    notificationType,
    externalId,
    status: mapZendryStatus(rawStatus),
    rawStatus,
    paidAt: (message.payment_date as string | undefined) ?? (message.created_at as string | undefined),
    raw: body as unknown as ZendryWebhookPayload,
  };
}

// Formato Nativo (painel novo, "Modo de webhook" = Nativo) — payload
// completamente diferente do Legado acima. Confirmado ao vivo em produção
// em 2026-08-21 (ver ZendryWebhookRawLog):
//   { event: "pix.received", sent_at, data: { charge_id, external_id,
//     amount_cents, description, end_to_end_id, environment, status: "pago" } }
// `charge_id`/`external_id` vêm iguais nesse payload e batem com o
// reference_code que a gente já salva como Transaction.externalId — ver
// zendry.acquirer.ts. Só o evento "pix.received" foi confirmado até agora;
// o de saque ("pix.sent"? não confirmado) cai em null aqui e cabe a quem
// chama tentar como saque (ver zendryWebhook.controller.ts).
export function parseZendryNativeWebhook(payload: unknown): ParsedZendryWebhook | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;

  const event = body.event as string | undefined;
  const data = body.data as Record<string, unknown> | undefined;
  if (!event || !data) return null;

  const externalId =
    (data.charge_id as string | undefined) ??
    (data.external_id as string | undefined) ??
    (data.reference_code as string | undefined);
  if (!externalId) return null;

  const rawStatus = data.status as string | undefined;

  return {
    notificationType: "pix_native",
    externalId,
    status: mapZendryStatus(rawStatus),
    rawStatus,
    paidAt: (data.paid_at as string | undefined) ?? (body.sent_at as string | undefined),
    raw: body as unknown as ZendryWebhookPayload,
  };
}
