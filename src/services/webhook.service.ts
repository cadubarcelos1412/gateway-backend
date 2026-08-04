// src/services/webhook.service.ts
import crypto from "crypto";
import { WebhookEndpoint, IWebhookEndpoint } from "../models/webhookEndpoint.model";
import { WebhookDelivery } from "../models/webhookDelivery.model";

// 4 tentativas: imediata, +10s, +1min, +5min.
const RETRY_DELAYS_MS = [0, 10_000, 60_000, 5 * 60_000];

function signPayload(secret: string, timestamp: number, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Dispara um evento de webhook para todos os endpoints ativos do merchant
 * inscritos nesse tipo de evento (ou em "*"). Fire-and-forget — nunca deve
 * bloquear/derrubar o fluxo que a chamou (criação de pagamento, mudança de
 * status via webhook de adquirente, etc).
 */
export async function dispatchWebhookEvent(
  merchantId: string,
  type: string,
  dataObject: Record<string, unknown>
): Promise<void> {
  try {
    const endpoints = await WebhookEndpoint.find({
      merchantId,
      active: true,
      events: { $in: [type, "*"] },
    });

    if (endpoints.length === 0) return;

    const eventId = `evt_${crypto.randomBytes(12).toString("hex")}`;
    const event = {
      id: eventId,
      type,
      created: Math.floor(Date.now() / 1000),
      data: { object: dataObject },
    };
    const rawBody = JSON.stringify(event);

    for (const endpoint of endpoints) {
      void deliverWithRetry(endpoint, event, rawBody, 0);
    }
  } catch (err) {
    console.error("⚠️ Falha ao despachar evento de webhook:", err);
  }
}

async function deliverWithRetry(
  endpoint: IWebhookEndpoint,
  event: { id: string; type: string },
  rawBody: string,
  attempt: number
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(endpoint.secret, timestamp, rawBody);

  let responseStatus = 0;
  let success = false;
  let errorMessage: string | undefined;

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PYX-Signature": `t=${timestamp},v1=${signature}`,
      },
      body: rawBody,
    });
    responseStatus = response.status;
    success = response.status >= 200 && response.status < 300;
  } catch (err: any) {
    errorMessage = err?.message || "Erro de rede ao entregar webhook.";
  }

  await WebhookDelivery.create({
    endpointId: endpoint._id,
    merchantId: endpoint.merchantId,
    eventId: event.id,
    eventType: event.type,
    url: endpoint.url,
    attempt: attempt + 1,
    responseStatus,
    success,
    error: errorMessage,
  });

  const nextAttempt = attempt + 1;
  if (!success && nextAttempt < RETRY_DELAYS_MS.length) {
    setTimeout(() => {
      void deliverWithRetry(endpoint, event, rawBody, nextAttempt);
    }, RETRY_DELAYS_MS[nextAttempt]);
  }
}
