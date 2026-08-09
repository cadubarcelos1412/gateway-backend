// src/controllers/v1/payment.controller.ts
import { Response } from "express";
import mongoose from "mongoose";
import { ApiKeyRequest } from "../../middleware/authApiKey";
import { Transaction } from "../../models/transaction.model";
import { TransactionService, CreateTransactionInput } from "../../services/transaction.service";
import { publicPaymentSchema } from "../../validation/v1/payment.schema";
import { toPublicPayment } from "../../utils/publicPayment";
import { fromPublicId } from "../../utils/publicIds";
import { refreshPendingPixIfNeeded } from "../../services/zendryReconciliation.service";

type ApiErrorType = "invalid_request_error" | "authentication_error" | "card_error" | "api_error";

function sendApiError(
  res: Response,
  status: number,
  type: ApiErrorType,
  code: string,
  message: string,
  param?: string
): void {
  res.status(status).json({ error: { type, code, message, param } });
}

/**
 * POST /v1/payments
 */
export const createPayment = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const parsed = publicPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    sendApiError(res, 400, "invalid_request_error", "invalid_payload", issue?.message || "Payload inválido.", issue?.path?.join("."));
    return;
  }

  const body = parsed.data;
  const idempotencyKeyHeader = req.headers["idempotency-key"];

  const input: CreateTransactionInput = {
    amount: body.amount / 100,
    method: body.payment_method === "card" ? "credit_card" : "pix",
    description: body.description,
    idempotencyKey: typeof idempotencyKeyHeader === "string" ? idempotencyKeyHeader : undefined,
    customer: body.customer,
    // "source" identifica a origem na tela de vendas do seller — sempre
    // "api" aqui, nunca sobrescrevível pelo metadata que o integrador manda.
    metadata: { ...body.metadata, source: "api" },
    card: body.card
      ? {
          number: body.card.number,
          holderName: body.card.holder_name,
          expirationDate: body.card.expiration_date,
          securityCode: body.card.security_code,
          installments: body.card.installments,
        }
      : undefined,
    threedsData: body.threeds_data,
  };

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transaction } = await TransactionService.createTransactionCore({
      seller: req.merchant!,
      session,
      input,
      ip: req.ip || "",
      userAgent: (req.headers["user-agent"] as string) || "unknown",
      mode: req.apiKeyMode!,
    });
    await session.commitTransaction();

    res.status(201).json(toPublicPayment(transaction));
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Erro em createPayment (/v1/payments):", error);
    const knownCode = (error as Error & { code?: string }).code;
    sendApiError(
      res,
      400,
      "invalid_request_error",
      knownCode || "payment_creation_failed",
      (error as Error).message || "Erro ao criar pagamento.",
      knownCode === "self_payment_not_allowed" ? "customer.document" : undefined
    );
  } finally {
    session.endSession();
  }
};

/**
 * GET /v1/payments/:id
 */
export const getPayment = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const rawId = fromPublicId("pay", req.params.id);
  if (!rawId) {
    sendApiError(res, 404, "invalid_request_error", "not_found", "Pagamento não encontrado.");
    return;
  }

  let transaction = await Transaction.findOne({
    _id: rawId,
    userId: req.merchant!.userId,
    mode: req.apiKeyMode,
  });

  if (!transaction) {
    sendApiError(res, 404, "invalid_request_error", "not_found", "Pagamento não encontrado.");
    return;
  }

  // ⚡ Integrador consultando status agora (polling do próprio checkout
  // dele) — checa a Zendry ao vivo em vez de só ler o cache, mesmo
  // mecanismo usado pelo checkout hospedado por nós.
  const changed = await refreshPendingPixIfNeeded(transaction);
  if (changed) {
    const refreshed = await Transaction.findById(rawId);
    if (refreshed) transaction = refreshed;
  }

  res.status(200).json(toPublicPayment(transaction));
};

/**
 * GET /v1/payments?limit=&page=&status=&created_after=&created_before=
 */
export const listPayments = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const filter: Record<string, unknown> = {
    userId: req.merchant!.userId,
    mode: req.apiKeyMode,
  };

  if (typeof req.query.status === "string") {
    const publicToInternal: Record<string, string> = { pending: "pending", paid: "approved", failed: "failed", refunded: "refunded" };
    const internalStatus = publicToInternal[req.query.status];
    if (internalStatus) filter.status = internalStatus;
  }

  const createdRange: Record<string, Date> = {};
  if (typeof req.query.created_after === "string") createdRange.$gte = new Date(req.query.created_after);
  if (typeof req.query.created_before === "string") createdRange.$lte = new Date(req.query.created_before);
  if (Object.keys(createdRange).length > 0) filter.createdAt = createdRange;

  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Transaction.countDocuments(filter),
  ]);

  res.status(200).json({
    object: "list",
    data: transactions.map(toPublicPayment),
    page,
    limit,
    total,
    has_more: page * limit < total,
  });
};
