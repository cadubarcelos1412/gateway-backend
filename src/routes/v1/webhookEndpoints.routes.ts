// src/routes/v1/webhookEndpoints.routes.ts
import { Router } from "express";
import { createEndpoint, listEndpoints, updateEndpoint, removeEndpoint } from "../../controllers/v1/webhookEndpoint.controller";
import { requireScope } from "../../middleware/requireScope";

const router = Router();

router.post("/", requireScope("webhooks:write"), createEndpoint);
router.get("/", requireScope("webhooks:read"), listEndpoints);
router.patch("/:id", requireScope("webhooks:write"), updateEndpoint);
router.delete("/:id", requireScope("webhooks:write"), removeEndpoint);

export default router;
