import crypto from "crypto";
import type { ZendryVerificationStatus } from "../zendry/types";
import { mapSttartTransactionStatus } from "./status-mapper";

// Verificação de assinatura do webhook de cash-in da Sttart. A doc mostra
// que cada endpoint cadastrado (POST /v1/api/webhook/webhook-endpoints)
// recebe um `secret` no formato `whsec_...` (mesmo padrão visual do
// Stripe) — MAS não temos confirmação de qual header carrega a assinatura
// nem do algoritmo exato (assumindo HMAC-SHA256 sobre o corpo cru, mesmo
// mecanismo já confirmado funcionando pro lado Zendry). Isso só vai ficar
// 100% certo quando o primeiro evento real chegar — loga os headers
// recebidos quando nenhum candidato bater, mesma tática já usada em
// zendryWebhook.controller.ts pra descobrir o header real em produção.
const SIGNATURE_HEADERS = ["x-sttart-signature", "sttart-signature", "x-signature"];

export function findWebhookSignatureHeader(
  headers: Record<string, unknown>
): { header: string; value: string } | null {
  for (const name of SIGNATURE_HEADERS) {
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

export function verifyWebhookHmacSignature(rawBody: Buffer, providedSignature: string, secret: string): boolean {
  const expectedHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBase64 = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

  const cleaned = providedSignature.trim().replace(/^sha256=/i, "");

  return timingSafeEqualStrings(cleaned, expectedHex) || timingSafeEqualStrings(cleaned, expectedBase64);
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
