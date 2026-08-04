// src/controllers/v1/refund.controller.ts
import { Response } from "express";
import { ApiKeyRequest } from "../../middleware/authApiKey";

/**
 * POST /v1/refunds
 * Não há lógica de estorno no gateway ainda (ver docs/AUDITORIA.md) — mexer
 * em ledger/wallet para reverter uma transação é trabalho não-trivial e
 * fora do escopo desta etapa. Respondemos com um erro claro e documentado
 * em vez de simular um estorno que não acontece de fato.
 */
export const createRefund = async (_req: ApiKeyRequest, res: Response): Promise<void> => {
  res.status(501).json({
    error: {
      type: "invalid_request_error",
      code: "not_implemented",
      message: "Estornos ainda não são suportados pela API. Em breve.",
    },
  });
};
