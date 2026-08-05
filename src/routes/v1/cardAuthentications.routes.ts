// src/routes/v1/cardAuthentications.routes.ts
import { Router } from "express";
import { getCardAuthenticationToken } from "../../controllers/v1/cardAuthentication.controller";

const router = Router();

router.get("/token", getCardAuthenticationToken);

export default router;
