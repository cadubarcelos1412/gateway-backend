// src/middleware/authRateLimit.ts
import rateLimit from "express-rate-limit";

/**
 * 🔒 Achado de auditoria de segurança (2026-08-30): `express-rate-limit` já
 * era dependência do projeto, mas só estava aplicado na API pública (/v1,
 * ver apiKeyRateLimit.ts) — login, verificação de código, esqueci/reset de
 * senha e o bootstrap de token master (`/api/master/auth`) não tinham
 * limite nenhum, ficando abertos a força bruta ilimitada.
 *
 * Por IP (não por conta) — é a defesa possível pré-login, quando ainda não
 * se sabe qual conta está sendo alvo. Implementação em memória (mesma
 * ressalva de apiKeyRateLimit.ts): suficiente pra uma instância só, revisar
 * se o backend escalar horizontalmente (precisaria de um store compartilhado,
 * ex. Redis).
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      status: false,
      msg: "Muitas tentativas. Tente novamente em alguns minutos.",
    });
  },
});

/**
 * Limite mais permissivo pra ações legítimas repetíveis (criar cobrança de
 * checkout, pedir saque) — não é proteção contra força bruta de senha, é só
 * um teto contra abuso/spam automatizado num endpoint que move dinheiro.
 */
export const sensitiveActionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      status: false,
      msg: "Muitas requisições em pouco tempo. Tente novamente em instantes.",
    });
  },
});
