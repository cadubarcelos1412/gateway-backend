// src/controllers/v1/testPayment.controller.ts
import { Response } from "express";
import { ApiKeyRequest } from "../../middleware/authApiKey";
import { Transaction } from "../../models/transaction.model";
import { toPublicPayment } from "../../utils/publicPayment";
import { fromPublicId } from "../../utils/publicIds";
import { dispatchWebhookEvent } from "../../services/webhook.service";

async function loadTestPayment(req: ApiKeyRequest, res: Response) {
  const rawId = fromPublicId("pay", req.params.id);
  if (!rawId) {
    res.status(404).json({ error: { type: "invalid_request_error", code: "not_found", message: "Pagamento não encontrado." } });
    return null;
  }

  const transaction = await Transaction.findOne({
    _id: rawId,
    userId: req.merchant!.userId,
    mode: "test",
  });

  if (!transaction) {
    res.status(404).json({ error: { type: "invalid_request_error", code: "not_found", message: "Pagamento não encontrado." } });
    return null;
  }

  if (req.apiKeyMode !== "test") {
    res.status(400).json({
      error: {
        type: "invalid_request_error",
        code: "wrong_mode",
        message: "Simulação só é permitida com uma chave de API em modo teste (sk_test_...).",
      },
    });
    return null;
  }

  if (transaction.status !== "pending") {
    res.status(400).json({
      error: {
        type: "invalid_request_error",
        code: "invalid_status_transition",
        message: `Pagamento já está com status '${transaction.status}', não pode ser simulado novamente.`,
      },
    });
    return null;
  }

  return transaction;
}

/**
 * POST /v1/test/payments/:id/pay
 * Só funciona em transações mode:"test" e status:"pending" — simula a
 * confirmação sem envolver nenhuma adquirente real.
 */
export const simulatePaymentPaid = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const transaction = await loadTestPayment(req, res);
  if (!transaction) return;

  transaction.status = "approved";
  await transaction.save();

  void dispatchWebhookEvent(String(req.merchant!._id), "payment.paid", toPublicPayment(transaction));

  res.status(200).json(toPublicPayment(transaction));
};

/**
 * POST /v1/test/payments/:id/fail
 */
export const simulatePaymentFailed = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const transaction = await loadTestPayment(req, res);
  if (!transaction) return;

  transaction.status = "failed";
  await transaction.save();

  void dispatchWebhookEvent(String(req.merchant!._id), "payment.failed", toPublicPayment(transaction));

  res.status(200).json(toPublicPayment(transaction));
};
