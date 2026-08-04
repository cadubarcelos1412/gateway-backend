// src/routes/webhookEndpoints.routes.ts
import { Router } from "express";
import {
  createDashboardWebhookEndpoint,
  listDashboardWebhookEndpoints,
  updateDashboardWebhookEndpoint,
  deleteDashboardWebhookEndpoint,
} from "../controllers/webhookEndpoint.controller";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🔔 Webhook endpoints do seller (dashboard, autenticado por JWT)            */
/* Prefixo base: /api/developers/webhook-endpoints                            */
/* -------------------------------------------------------------------------- */

router.post("/", createDashboardWebhookEndpoint);
router.get("/", listDashboardWebhookEndpoints);
router.patch("/:id", updateDashboardWebhookEndpoint);
router.delete("/:id", deleteDashboardWebhookEndpoint);

export default router;
