import type { ZendryVerificationStatus } from "../zendry/types";

// Normaliza o vocabulário de status da Sttart pro mesmo vocabulário que o
// resto do sistema já usa (herdado da Zendry, ver lib/zendry/status-mapper.ts
// e o comentário em pixPayoutReconciliation.service.ts) — CashoutRequest,
// WithdrawalPage.tsx e a reconciliação comparam por igualdade EXATA contra
// "completed"/"canceled" (minúsculo, inglês americano), então qualquer
// adapter novo precisa devolver exatamente esses literais nos estados
// terminais, senão saque cancelado/falho fica exibido como sucesso
// silenciosamente (already aconteceu uma vez com a Zendry, ver
// CashoutService.refundFailedPixPayout).

/** Cash-in — transaction.succeeded/failed (webhook) ou status bruto (polling). */
export function mapSttartTransactionStatus(raw: string | undefined): ZendryVerificationStatus {
  const normalized = (raw || "").toUpperCase();
  if (normalized === "SUCCEEDED" || normalized === "APPROVED" || normalized === "PAID") return "approved";
  if (normalized === "FAILED" || normalized === "REJECTED" || normalized === "CANCELED" || normalized === "CANCELLED") {
    return "rejected";
  }
  return "pending";
}

/**
 * Cash-out — ciclo documentado: PENDING_APPROVAL → APPROVED →
 * COMPLETED|REJECTED|FAILED, ou CANCELLED (só a partir de PENDING_APPROVAL).
 * Só COMPLETED e as 3 formas de "não completou" (REJECTED/FAILED/CANCELLED)
 * são terminais — o resto (PENDING_APPROVAL/APPROVED) fica como está
 * (nenhum código compara contra eles, só contra "completed"/"canceled").
 */
export function mapSttartPayoutStatus(raw: string | undefined): string {
  const normalized = (raw || "").toUpperCase();
  if (normalized === "COMPLETED") return "completed";
  if (normalized === "REJECTED" || normalized === "FAILED" || normalized === "CANCELLED" || normalized === "CANCELED") {
    return "canceled";
  }
  return raw || "";
}
