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
