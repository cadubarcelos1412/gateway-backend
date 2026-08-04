// src/controllers/v1/webhookEndpoint.controller.ts
import { Response } from "express";
import { ApiKeyRequest } from "../../middleware/authApiKey";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
} from "../../services/webhookEndpoint.service";
import { createWebhookEndpointSchema, updateWebhookEndpointSchema } from "../../validation/v1/webhookEndpoint.schema";

function toPublicWebhookEndpoint(endpoint: any) {
  const json = endpoint.toJSON ? endpoint.toJSON() : endpoint;
  return { ...json, id: `we_${json.id}` };
}

/**
 * POST /v1/webhook_endpoints
 */
export const createEndpoint = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const parsed = createWebhookEndpointSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        type: "invalid_request_error",
        code: "invalid_payload",
        message: parsed.error.issues[0]?.message || "Payload inválido.",
      },
    });
    return;
  }

  const endpoint = await createWebhookEndpoint(String(req.merchant!._id), parsed.data.url, parsed.data.events);
  res.status(201).json(toPublicWebhookEndpoint(endpoint));
};

/**
 * GET /v1/webhook_endpoints
 */
export const listEndpoints = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const endpoints = await listWebhookEndpoints(String(req.merchant!._id));
  res.status(200).json({ object: "list", data: endpoints.map(toPublicWebhookEndpoint) });
};

/**
 * PATCH /v1/webhook_endpoints/:id
 */
export const updateEndpoint = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const parsed = updateWebhookEndpointSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        type: "invalid_request_error",
        code: "invalid_payload",
        message: parsed.error.issues[0]?.message || "Payload inválido.",
      },
    });
    return;
  }

  const id = req.params.id.replace(/^we_/, "");
  const endpoint = await updateWebhookEndpoint(String(req.merchant!._id), id, parsed.data);
  if (!endpoint) {
    res.status(404).json({ error: { type: "invalid_request_error", code: "not_found", message: "Webhook endpoint não encontrado." } });
    return;
  }

  res.status(200).json(toPublicWebhookEndpoint(endpoint));
};

/**
 * DELETE /v1/webhook_endpoints/:id
 */
export const removeEndpoint = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const id = req.params.id.replace(/^we_/, "");
  const endpoint = await deleteWebhookEndpoint(String(req.merchant!._id), id);
  if (!endpoint) {
    res.status(404).json({ error: { type: "invalid_request_error", code: "not_found", message: "Webhook endpoint não encontrado." } });
    return;
  }

  res.status(204).send();
};
