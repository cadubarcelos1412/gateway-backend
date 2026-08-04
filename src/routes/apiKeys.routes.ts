// src/routes/apiKeys.routes.ts
import { Router } from "express";
import { createApiKey, listApiKeys, revokeApiKey, rotateApiKey } from "../controllers/apiKey.controller";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🔑 Gestão de chaves de API do seller (dashboard, autenticado por JWT)      */
/* Prefixo base: /api/developers/api-keys                                     */
/* -------------------------------------------------------------------------- */

router.post("/", createApiKey);
router.get("/", listApiKeys);
router.post("/:id/revoke", revokeApiKey);
router.post("/:id/rotate", rotateApiKey);

export default router;
