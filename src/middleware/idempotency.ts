// src/middleware/idempotency.ts
import crypto from "crypto";
import { Response, NextFunction } from "express";
import { IdempotencyRecord } from "../models/idempotencyRecord.model";
import { ApiKeyRequest } from "./authApiKey";

/**
 * Suporte ao header `Idempotency-Key` em POSTs da API pública: mesma chave +
 * mesmo payload retorna a resposta já registrada, sem reprocessar. Chave
 * reaproveitada com payload diferente é rejeitada (400). TTL de 24h — ver
 * IdempotencyRecord.
 *
 * Deve rodar DEPOIS de authApiKey (usa req.merchant para escopar por conta).
 */
export const idempotency = async (req: ApiKeyRequest, res: Response, next: NextFunction): Promise<void> => {
  const rawKey = req.headers["idempotency-key"];
  if (!rawKey || typeof rawKey !== "string") {
    next();
    return;
  }

  const merchantId = req.merchant!.id as string;
  const requestHash = crypto.createHash("sha256").update(JSON.stringify(req.body ?? {})).digest("hex");

  try {
    const existing = await IdempotencyRecord.findOne({ merchantId, idempotencyKey: rawKey });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        res.status(400).json({
          error: {
            type: "invalid_request_error",
            code: "idempotency_key_reused",
            message: "Esta Idempotency-Key já foi usada com um payload diferente.",
          },
        });
        return;
      }

      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }
  } catch (err) {
    console.error("⚠️ Erro ao consultar IdempotencyRecord:", err);
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    IdempotencyRecord.create({
      merchantId,
      idempotencyKey: rawKey,
      requestHash,
      responseStatus: res.statusCode,
      responseBody: body,
    }).catch((err) => console.error("⚠️ Falha ao gravar IdempotencyRecord:", err));

    return originalJson(body);
  }) as typeof res.json;

  next();
};
