// src/routes/v1/webhookEndpoints.routes.ts
import { Router } from "express";
import { createEndpoint, listEndpoints, updateEndpoint, removeEndpoint } from "../../controllers/v1/webhookEndpoint.controller";

const router = Router();

router.post("/", createEndpoint);
router.get("/", listEndpoints);
router.patch("/:id", updateEndpoint);
router.delete("/:id", removeEndpoint);

export default router;
