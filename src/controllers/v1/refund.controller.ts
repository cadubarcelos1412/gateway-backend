// src/controllers/v1/refund.controller.ts
import { Response } from "express";
import { ApiKeyRequest } from "../../middleware/authApiKey";
import { publicRefundSchema } from "../../validation/v1/refund.schema";
import { fromPublicId } from "../../utils/publicIds";
import { RefundService, RefundError } from "../../services/refund.service";
import { toPublicPayment } from "../../utils/publicPayment";

type ApiErrorType = "invalid_request_error" | "authentication_error" | "card_error" | "api_error";

function sendApiError(res: Response, status: number, type: ApiErrorType, code: string, message: string, param?: string): void {
  res.status(status).json({ error: { type, code, message, param } });
}

const ERROR_TYPE_BY_CODE: Record<string, ApiErrorType> = {
  not_found: "invalid_request_error",
  already_refunded: "invalid_request_error",
  not_refundable: "invalid_request_error",
  test_mode_not_supported: "invalid_request_error",
  seller_not_found: "api_error",
  acquirer_refund_unsupported: "api_error",
  acquirer_refund_failed: "api_error",
  internal_reversal_failed: "api_error",
};

/**
 * POST /v1/refunds
 *
 * Estorna um pagamento com status "paid". Só funciona hoje para sellers com
 * adquirente "pagarme" (refund real via SDK oficial) — para "zendry", o
 * endpoint de estorno nunca foi confirmado com o suporte deles, então a
 * chamada falha com `acquirer_refund_unsupported`/`acquirer_refund_failed`
 * em vez de fingir que funcionou (ver acquirers/zendry.acquirer.ts).
 */
export const createRefund = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const parsed = publicRefundSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    sendApiError(res, 400, "invalid_request_error", "invalid_payload", issue?.message || "Payload inválido.", issue?.path?.join("."));
    return;
  }

  const rawId = fromPublicId("pay", parsed.data.payment_id);
  if (!rawId) {
    sendApiError(res, 400, "invalid_request_error", "invalid_payload", "payment_id inválido.", "payment_id");
    return;
  }

  try {
    const transaction = await RefundService.createRefund({
      transactionId: rawId,
      merchantUserId: req.merchant!.userId,
      apiKeyMode: req.apiKeyMode!,
      reason: parsed.data.reason,
      ip: req.ip || "",
      userAgent: (req.headers["user-agent"] as string) || "unknown",
    });

    res.status(200).json(toPublicPayment(transaction));
  } catch (error) {
    if (error instanceof RefundError) {
      sendApiError(res, error.status, ERROR_TYPE_BY_CODE[error.code] || "api_error", error.code, error.message);
      return;
    }
    console.error("❌ Erro em createRefund (/v1/refunds):", error);
    sendApiError(res, 500, "api_error", "internal_error", "Erro interno ao processar estorno.");
  }
};
