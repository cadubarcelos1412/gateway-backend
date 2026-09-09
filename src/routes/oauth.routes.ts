// src/routes/oauth.routes.ts
import { Router } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import {
  authorizationServerMetadata,
  decideAuthorize,
  issueToken,
  protectedResourceMetadata,
  registerClient,
  revokeToken,
  showAuthorize,
} from "../controllers/oauth.controller";

const router = Router();

// A tela de consentimento e o /oauth/token falam
// application/x-www-form-urlencoded (formulário HTML e OAuth 2.1, resp.) —
// o express.json() global do server.ts não cobre isso.
router.use(express.urlencoded({ extended: false }));

/** Registro dinâmico é aberto por definição (RFC 7591) — limitado por IP. */
const registrationLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", error_description: "Muitos registros de cliente a partir deste IP." },
});

/** Tentativa de login na tela de consentimento — mesmo tratamento do login normal. */
const authorizeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", error_description: "Muitas tentativas. Aguarde alguns minutos." },
});

router.post("/register", registrationLimit, registerClient);
router.get("/authorize", showAuthorize);
router.post("/authorize", authorizeLimit, decideAuthorize);
router.post("/token", authorizeLimit, issueToken);
router.post("/revoke", revokeToken);

export default router;

/** Rotas .well-known — montadas na raiz do app, não sob /oauth. */
export const wellKnownRouter = Router();
wellKnownRouter.get("/oauth-authorization-server", authorizationServerMetadata);
wellKnownRouter.get("/oauth-protected-resource", protectedResourceMetadata);
