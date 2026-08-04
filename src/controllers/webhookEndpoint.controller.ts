// src/controllers/webhookEndpoint.controller.ts
import { Request, Response } from "express";
import { decodeToken } from "../config/auth";
import { Seller } from "../models/seller.model";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
} from "../services/webhookEndpoint.service";
import { createWebhookEndpointSchema, updateWebhookEndpointSchema } from "../validation/v1/webhookEndpoint.schema";

/** Mesmo padrão manual (decodeToken + Seller.findOne) usado em apiKey.controller.ts. */
async function getAuthSeller(req: Request, res: Response) {
  const rawToken = req.headers.authorization?.replace("Bearer ", "");
  if (!rawToken) {
    res.status(401).json({ status: false, msg: "Token ausente." });
    return null;
  }

  const payload = await decodeToken(rawToken);
  if (!payload?.id) {
    res.status(401).json({ status: false, msg: "Token inválido." });
    return null;
  }

  const seller = await Seller.findOne({ userId: payload.id });
  if (!seller) {
    res.status(404).json({ status: false, msg: "Seller não encontrado para este usuário." });
    return null;
  }

  return seller;
}

/**
 * POST /api/developers/webhook-endpoints
 */
export const createDashboardWebhookEndpoint = async (req: Request, res: Response): Promise<void> => {
  const seller = await getAuthSeller(req, res);
  if (!seller) return;

  const parsed = createWebhookEndpointSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ status: false, msg: parsed.error.issues[0]?.message || "Payload inválido." });
    return;
  }

  try {
    const endpoint = await createWebhookEndpoint(String(seller._id), parsed.data.url, parsed.data.events);
    res.status(201).json({ status: true, webhookEndpoint: endpoint.toJSON() });
  } catch (err) {
    console.error("❌ Erro em createDashboardWebhookEndpoint:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao criar webhook endpoint." });
  }
};

/**
 * GET /api/developers/webhook-endpoints
 */
export const listDashboardWebhookEndpoints = async (req: Request, res: Response): Promise<void> => {
  const seller = await getAuthSeller(req, res);
  if (!seller) return;

  try {
    const endpoints = await listWebhookEndpoints(String(seller._id));
    res.status(200).json({ status: true, webhookEndpoints: endpoints.map((e) => e.toJSON()) });
  } catch (err) {
    console.error("❌ Erro em listDashboardWebhookEndpoints:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao listar webhook endpoints." });
  }
};

/**
 * PATCH /api/developers/webhook-endpoints/:id
 */
export const updateDashboardWebhookEndpoint = async (req: Request, res: Response): Promise<void> => {
  const seller = await getAuthSeller(req, res);
  if (!seller) return;

  const parsed = updateWebhookEndpointSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ status: false, msg: parsed.error.issues[0]?.message || "Payload inválido." });
    return;
  }

  try {
    const endpoint = await updateWebhookEndpoint(String(seller._id), req.params.id, parsed.data);
    if (!endpoint) {
      res.status(404).json({ status: false, msg: "Webhook endpoint não encontrado." });
      return;
    }
    res.status(200).json({ status: true, webhookEndpoint: endpoint.toJSON() });
  } catch (err) {
    console.error("❌ Erro em updateDashboardWebhookEndpoint:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar webhook endpoint." });
  }
};

/**
 * DELETE /api/developers/webhook-endpoints/:id
 */
export const deleteDashboardWebhookEndpoint = async (req: Request, res: Response): Promise<void> => {
  const seller = await getAuthSeller(req, res);
  if (!seller) return;

  try {
    const endpoint = await deleteWebhookEndpoint(String(seller._id), req.params.id);
    if (!endpoint) {
      res.status(404).json({ status: false, msg: "Webhook endpoint não encontrado." });
      return;
    }
    res.status(200).json({ status: true, msg: "Webhook endpoint removido." });
  } catch (err) {
    console.error("❌ Erro em deleteDashboardWebhookEndpoint:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao remover webhook endpoint." });
  }
};
