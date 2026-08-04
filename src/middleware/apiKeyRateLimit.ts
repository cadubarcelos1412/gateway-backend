// src/middleware/apiKeyRateLimit.ts
import rateLimit from "express-rate-limit";
import { ApiKeyRequest } from "./authApiKey";

/**
 * Rate limit por chave de API (100 req/min). Precisa rodar DEPOIS de
 * authApiKey, já que usa req.apiKeyId como chave de contagem.
 * Implementação em memória (não distribuída) — suficiente para o estágio
 * atual de uma única instância; revisar se o backend escalar horizontalmente.
 */
export const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: ApiKeyRequest) => req.apiKeyId ?? req.ip ?? "unknown",
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        type: "api_error",
        code: "rate_limit_exceeded",
        message: "Limite de requisições excedido. Tente novamente em instantes.",
      },
    });
  },
});
