import crypto from "crypto";
import type { ZendryVerificationStatus } from "../zendry/types";
import { mapSttartTransactionStatus } from "./status-mapper";

// Autenticação do webhook de cash-in da Sttart — confirmado ao vivo
// (2026-08-31, 3 chamadas reais recebidas): a Sttart NÃO manda nenhum
// header de assinatura HMAC (nem x-sttart-signature nem qualquer variante
// — os 17 headers reais recebidos foram só os de infraestrutura/proxy,
// nenhum de auth). O `secret` (whsec_...) devolvido no cadastro do
// endpoint não é usado assim. O mecanismo real é `customHeaders` (campo
// do POST /v1/api/webhook/webhook-endpoints): a gente escolhe um header e
// valor na hora do cadastro, e a Sttart devolve exatamente esse header em
// toda chamada — comparação simples, não HMAC.
const CUSTOM_AUTH_HEADER = "x-pyxgate-webhook-key";

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function findWebhookSignatureHeader(
  headers: Record<string, unknown>
): { header: string; value: string } | null {
  const value = headers[CUSTOM_AUTH_HEADER];
  if (typeof value === "string" && value.length > 0) {
    return { header: CUSTOM_AUTH_HEADER, value };
  }
  return null;
}

export function verifyWebhookHmacSignature(_rawBody: Buffer, providedValue: string, secret: string): boolean {
  return timingSafeEqualStrings(providedValue.trim(), secret);
}

// Envelope padrão documentado: { eventId, eventType, occurredAt,
// resource: { type, id }, attributes }. Só nos interessa transaction.* aqui
// (cash-in) — cash-out não tem webhook (ver lib/sttart/payout.ts).
export interface ParsedSttartWebhook {
  eventId: string;
  eventType: string;
  externalId: string;
  status: ZendryVerificationStatus;
  raw: unknown;
}

export function parseSttartWebhook(payload: unknown): ParsedSttartWebhook | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;

  const eventId = body.eventId as string | undefined;
  const eventType = body.eventType as string | undefined;
  const resource = body.resource as Record<string, unknown> | undefined;
  const externalId = resource?.id as string | undefined;
  if (!eventId || !eventType || !externalId) return null;

  if (!eventType.startsWith("transaction.")) return null;

  // eventType já diz o resultado (succeeded/failed) — não depende do corpo
  // de `attributes` trazer um campo de status próprio.
  const status = mapSttartTransactionStatus(eventType === "transaction.succeeded" ? "SUCCEEDED" : eventType === "transaction.failed" ? "FAILED" : undefined);

  return { eventId, eventType, externalId, status, raw: body };
}
