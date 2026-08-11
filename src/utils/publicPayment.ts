// src/utils/publicPayment.ts
import { ITransaction } from "../models/transaction.model";
import { toPublicId } from "./publicIds";

const STATUS_MAP: Record<ITransaction["status"], string> = {
  pending: "pending",
  approved: "paid",
  failed: "failed",
};

const METHOD_MAP: Record<ITransaction["method"], string> = {
  pix: "pix",
  credit_card: "card",
  boleto: "boleto",
};

/**
 * Converte uma Transaction interna (armazenada em reais) para o formato
 * público da API /v1 (valores em centavos, shape estável independente de
 * mudanças no schema interno).
 */
export function toPublicPayment(tx: ITransaction) {
  return {
    id: toPublicId("pay", tx._id),
    object: "payment",
    amount: Math.round(tx.amount * 100),
    fee: Math.round(tx.fee * 100),
    net_amount: Math.round(tx.netAmount * 100),
    currency: "BRL",
    status: STATUS_MAP[tx.status] ?? tx.status,
    payment_method: METHOD_MAP[tx.method] ?? tx.method,
    mode: tx.mode,
    customer: tx.purchaseData?.customer
      ? {
          name: tx.purchaseData.customer.name,
          email: tx.purchaseData.customer.email,
          document: tx.purchaseData.customer.document,
        }
      : undefined,
    metadata: tx.metadata ?? {},
    qr_code: tx.paymentDetails?.pixCode,
    qr_code_base64: tx.paymentDetails?.pixQrCodeBase64,
    card: tx.paymentDetails?.cardLastDigits
      ? {
          last4: tx.paymentDetails.cardLastDigits,
          brand: tx.paymentDetails.cardBrand,
          authorization_code: tx.paymentDetails.cardAuthorizationCode,
        }
      : undefined,
    created: Math.floor(new Date(tx.createdAt).getTime() / 1000),
  };
}

export type PublicPayment = ReturnType<typeof toPublicPayment>;
