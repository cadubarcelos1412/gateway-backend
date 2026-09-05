// src/services/webhookEndpoint.service.ts
import crypto from "crypto";
import { WebhookEndpoint, WEBHOOK_EVENT_TYPES, PLATFORM_EVENT_TYPES } from "../models/webhookEndpoint.model";

/**
 * Lógica compartilhada de CRUD de webhook endpoints, reaproveitada tanto
 * pelo painel (JWT do dashboard) quanto pela API pública (/v1/webhook_endpoints,
 * autenticada por API key) — evita duplicar a mesma regra em dois controllers.
 */

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("hex")}`;
}

export function isValidEventList(events: unknown): events is string[] {
  if (!Array.isArray(events) || events.length === 0) return false;
  return events.every((e) => e === "*" || (WEBHOOK_EVENT_TYPES as readonly string[]).includes(e));
}

export async function createWebhookEndpoint(merchantId: string, url: string, events: string[]) {
  return WebhookEndpoint.create({
    merchantId,
    url,
    events,
    secret: generateWebhookSecret(),
    active: true,
  });
}

export async function listWebhookEndpoints(merchantId: string) {
  return WebhookEndpoint.find({ merchantId }).sort({ createdAt: -1 });
}

export async function updateWebhookEndpoint(
  merchantId: string,
  id: string,
  updates: { url?: string; events?: string[]; active?: boolean }
) {
  const endpoint = await WebhookEndpoint.findOne({ _id: id, merchantId });
  if (!endpoint) return null;

  if (updates.url) endpoint.url = updates.url;
  if (updates.events) endpoint.events = updates.events;
  if (typeof updates.active === "boolean") endpoint.active = updates.active;

  await endpoint.save();
  return endpoint;
}

export async function deleteWebhookEndpoint(merchantId: string, id: string) {
  return WebhookEndpoint.findOneAndDelete({ _id: id, merchantId });
}

/* -------------------------------------------------------------------------- */
/* 🌐 Endpoints de PLATAFORMA (scope: "platform") — só master, sem merchantId */
/* -------------------------------------------------------------------------- */

export function isValidPlatformEventList(events: unknown): events is string[] {
  if (!Array.isArray(events) || events.length === 0) return false;
  return events.every((e) => e === "*" || (PLATFORM_EVENT_TYPES as readonly string[]).includes(e));
}

export async function createPlatformWebhookEndpoint(url: string, events: string[]) {
  return WebhookEndpoint.create({
    scope: "platform",
    url,
    events,
    secret: generateWebhookSecret(),
    active: true,
  });
}

export async function listPlatformWebhookEndpoints() {
  return WebhookEndpoint.find({ scope: "platform" }).sort({ createdAt: -1 });
}

export async function updatePlatformWebhookEndpoint(
  id: string,
  updates: { url?: string; events?: string[]; active?: boolean }
) {
  const endpoint = await WebhookEndpoint.findOne({ _id: id, scope: "platform" });
  if (!endpoint) return null;

  if (updates.url) endpoint.url = updates.url;
  if (updates.events) endpoint.events = updates.events;
  if (typeof updates.active === "boolean") endpoint.active = updates.active;

  await endpoint.save();
  return endpoint;
}

export async function deletePlatformWebhookEndpoint(id: string) {
  return WebhookEndpoint.findOneAndDelete({ _id: id, scope: "platform" });
}
