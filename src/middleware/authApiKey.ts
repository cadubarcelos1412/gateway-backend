// src/middleware/authApiKey.ts
import { Request, Response, NextFunction } from "express";
import { ApiKey } from "../models/apiKey.model";
import { Seller, ISeller } from "../models/seller.model";
import { hashApiKey, timingSafeEqualHex } from "../utils/apiKeys";

export interface ApiKeyRequest extends Request {
  merchant?: ISeller;
  apiKeyMode?: "test" | "live";
  apiKeyId?: string;
}

type ErrorType = "invalid_request_error" | "authentication_error" | "api_error";

function sendApiError(res: Response, status: number, type: ErrorType, code: string, message: string): void {
  res.status(status).json({ error: { type, code, message } });
}

/**
 * 🔐 Middleware de autenticação para a API pública (/v1).
 * Lê "Authorization: Bearer sk_...", resolve o merchant dono da chave e
 * anexa `req.merchant` / `req.apiKeyMode` / `req.apiKeyId`.
 * Chaves publishable (pk_...) não autenticam aqui — são só para uso client-side.
 */
export const authApiKey = async (req: ApiKeyRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const header = req.headers.authorization;
    const rawKey = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;

    if (!rawKey || !rawKey.startsWith("sk_")) {
      sendApiError(
        res,
        401,
        "authentication_error",
        "missing_api_key",
        "Chave de API ausente ou inválida. Envie 'Authorization: Bearer sk_...'."
      );
      return;
    }

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
