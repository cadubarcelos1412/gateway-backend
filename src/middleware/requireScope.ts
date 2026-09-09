// src/middleware/requireScope.ts
import { Response, NextFunction } from "express";
import { ApiKeyRequest } from "./authApiKey";
import { OAuthScope } from "../utils/oauthTokens";

/**
 * 🔑 Exige um escopo específico na credencial que autenticou a requisição.
 * Roda sempre DEPOIS de authApiKey (usa req.scopes).
 *
 * `"*"` cobre tudo — é o default histórico das chaves sk_ já emitidas, que
 * continuam funcionando exatamente como antes. Token OAuth nunca recebe
 * curinga: só carrega o que o seller marcou na tela de consentimento.
 */
export const requireScope =
  (scope: OAuthScope) =>
  (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
    const scopes = req.scopes ?? [];
    if (scopes.includes("*") || scopes.includes(scope)) {
      next();
      return;
    }

    res.status(403).json({
      error: {
        type: "invalid_request_error",
        code: "insufficient_scope",
        message: `Esta credencial não tem o escopo '${scope}'. Autorize novamente pedindo esse escopo.`,
      },
    });
  };
