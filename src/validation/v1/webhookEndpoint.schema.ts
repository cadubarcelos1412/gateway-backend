import { z } from "zod";
import { WEBHOOK_EVENT_TYPES, PLATFORM_EVENT_TYPES } from "../../models/webhookEndpoint.model";

// Em produção exigimos https. Em dev/test permitimos http:// também, para
// dar pra testar contra um listener local (ex.: durante o checkpoint 3).
const isProduction = process.env.NODE_ENV === "production";

const webhookUrlSchema = z.string().url("url inválida.").refine((u) => !isProduction || u.startsWith("https://"), {
  message: "url deve usar https:// em produção.",
});

const webhookEventsSchema = z
  .array(z.string())
  .min(1, "Informe ao menos um evento.")
  .refine((events) => events.every((e) => e === "*" || (WEBHOOK_EVENT_TYPES as readonly string[]).includes(e)), {
    message: `events deve conter apenas: "*" ou um de [${WEBHOOK_EVENT_TYPES.join(", ")}]`,
  });

export const createWebhookEndpointSchema = z.object({
  url: webhookUrlSchema,
  events: webhookEventsSchema,
});

export const updateWebhookEndpointSchema = z.object({
  url: webhookUrlSchema.optional(),
  events: webhookEventsSchema.optional(),
  active: z.boolean().optional(),
});

const platformWebhookEventsSchema = z
  .array(z.string())
  .min(1, "Informe ao menos um evento.")
  .refine((events) => events.every((e) => e === "*" || (PLATFORM_EVENT_TYPES as readonly string[]).includes(e)), {
    message: `events deve conter apenas: "*" ou um de [${PLATFORM_EVENT_TYPES.join(", ")}]`,
  });

export const createPlatformWebhookEndpointSchema = z.object({
  url: webhookUrlSchema,
  events: platformWebhookEventsSchema,
});

export const updatePlatformWebhookEndpointSchema = z.object({
  url: webhookUrlSchema.optional(),
  events: platformWebhookEventsSchema.optional(),
  active: z.boolean().optional(),
});
