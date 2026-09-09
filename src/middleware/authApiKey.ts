// src/middleware/authApiKey.ts
import { Request, Response, NextFunction } from "express";
import { ApiKey } from "../models/apiKey.model";
import { Seller, ISeller } from "../models/seller.model";
import { hashApiKey, timingSafeEqualHex } from "../utils/apiKeys";
import { allowedResources, verifyAccessToken } from "../utils/oauthTokens";

export interface ApiKeyRequest extends Request {
  merchant?: ISeller;
  apiKeyMode?: "test" | "live";
  apiKeyId?: string;
  /**
   * Escopos concedidos ao portador. Chave sk_ traz o que estiver no
   * documento (default ["*"] = tudo, retrocompatível com as chaves já
   * emitidas); token OAuth traz só o que o seller marcou no consentimento.
   */
  scopes?: string[];
  /** Presente só quando a autenticação veio por OAuth. */
  oauthClientId?: string;
}

type ErrorType = "invalid_request_error" | "authentication_error" | "api_error";

function sendApiError(res: Response, status: number, type: ErrorType, code: string, message: string): void {
  res.status(status).json({ error: { type, code, message } });
}

/**
 * 🔐 Middleware de autenticação para a API pública (/v1).
 *
 * Aceita duas credenciais no mesmo header `Authorization: Bearer`:
 *
 * 1. **Chave de API** (`sk_live_` / `sk_test_`) — integração servidor a
 *    servidor, código determinístico do próprio integrador.
 * 2. **Access token OAuth 2.1** (JWT HS256 emitido por /oauth/token) — usado
 *    pelo servidor MCP e por qualquer app de terceiro que aja em nome do
 *    seller. Carrega escopos granulares e o modo escolhido no consentimento.
 *
 * Em ambos os casos o resultado é o mesmo contrato pra frente:
 * `req.merchant` / `req.apiKeyMode` / `req.scopes`.
 *
 * Chaves publishable (pk_...) não autenticam aqui — são só para uso client-side.
 */
export const authApiKey = async (req: ApiKeyRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const header = req.headers.authorization;
    const rawKey = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;

    if (!rawKey) {
      sendApiError(
        res,
        401,
        "authentication_error",
        "missing_api_key",
        "Credencial ausente. Envie 'Authorization: Bearer sk_...' ou um access token OAuth."
      );
      return;
    }

    /* -------- Caminho OAuth: qualquer coisa que não seja sk_ ------------- */
    if (!rawKey.startsWith("sk_")) {
      const claims = verifyAccessToken(rawKey, allowedResources());
      if (!claims) {
        sendApiError(
          res,
          401,
          "authentication_error",
          "invalid_token",
          "Access token inválido, expirado ou emitido para outro recurso."
        );
        return;
      }

      const merchant = await Seller.findById(claims.sub);
      if (!merchant) {
        sendApiError(res, 401, "authentication_error", "merchant_not_found", "Merchant do token não encontrado.");
        return;
      }

      req.merchant = merchant;
      req.apiKeyMode = claims.mode;
      req.scopes = claims.scope ? claims.scope.split(" ") : [];
      req.oauthClientId = claims.cid;
      // Contagem de rate limit por aplicação+merchant (ver apiKeyRateLimit).
      req.apiKeyId = `oauth:${claims.cid}:${claims.sub}`;
      next();
      return;
    }

    /* -------- Caminho chave de API ---------------------------------------- */
    const hashedKey = hashApiKey(rawKey);
    const apiKeyDoc = await ApiKey.findOne({ hashedKey });

    if (!apiKeyDoc || !timingSafeEqualHex(apiKeyDoc.hashedKey, hashedKey)) {
      sendApiError(res, 401, "authentication_error", "invalid_api_key", "Chave de API inválida.");
      return;
    }

    if (apiKeyDoc.revokedAt) {
      sendApiError(res, 401, "authentication_error", "revoked_api_key", "Esta chave de API foi revogada.");
      return;
    }

    const merchant = await Seller.findById(apiKeyDoc.merchantId);
    if (!merchant) {
      sendApiError(res, 401, "authentication_error", "merchant_not_found", "Merchant associado à chave não encontrado.");
      return;
    }

    req.merchant = merchant;
    req.apiKeyMode = apiKeyDoc.mode;
    req.apiKeyId = String(apiKeyDoc._id);
    req.scopes = apiKeyDoc.scopes?.length ? apiKeyDoc.scopes : ["*"];

    // Atualização não bloqueante — não atrasa a resposta da rota.
    ApiKey.updateOne({ _id: apiKeyDoc._id }, { $set: { lastUsedAt: new Date() } }).catch((err) =>
      console.error("⚠️ Falha ao atualizar lastUsedAt da API key:", err)
    );

    next();
  } catch (error) {
    console.error("💥 Erro no middleware authApiKey:", error);
    sendApiError(res, 500, "api_error", "internal_error", "Erro interno ao validar chave de API.");
  }
};
