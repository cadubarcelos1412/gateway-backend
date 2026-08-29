import { sttartFetch } from "./client";
import { mapSttartPayoutStatus } from "./status-mapper";

// Cash-out — POST /v1/api/cash-out/payouts (tipo PIX). Ciclo de vida
// documentado: PENDING_APPROVAL → APPROVED → COMPLETED|REJECTED|FAILED (ou
// CANCELLED, só a partir de PENDING_APPROVAL). SEM webhook de resultado —
// a doc é explícita ("No callback/webhook for payout outcome"), então quem
// usa isso PRECISA depender só de polling (ver
// sttartReconciliation.service.ts / pixPayoutReconciliation.service.ts),
// igual já vale (por desconfiança, não por documentação) pro lado Zendry.
//
// Idempotência via `referenceId` — documentada como única globalmente e
// segura pra retry (garantia que a Zendry nunca confirmou de verdade pra
// gente). Usamos o id do nosso CashoutRequest.
//
// Unidade de valor: assumindo reais decimais (BRL), não centavos — mesmo
// padrão do amount.original em cash-in/pix/dynamic. Não confirmado contra
// doc real/suporte ainda; validar no primeiro envio real.

export type SttartPixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

const PIX_KEY_TYPE_MAP: Record<string, SttartPixKeyType> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "EMAIL",
  phone: "PHONE",
  random: "EVP",
};

export interface SendSttartPayoutInput {
  idempotentId: string;
  pixKeyType: string;
  pixKey: string;
  receiverName?: string;
  receiverDocument?: string;
  valueCents: number;
}

export interface SendSttartPayoutResult {
  externalReference: string;
  status: string;
}

export async function sendPayout(input: SendSttartPayoutInput): Promise<SendSttartPayoutResult> {
  const { payout } = await sttartFetch<{ payout: { id: string; status: string } }>(
    "/v1/api/cash-out/payouts",
    {
      method: "POST",
      body: {
        type: "PIX",
        amount: input.valueCents / 100,
        holderDocument: input.receiverDocument,
        holderName: input.receiverName,
        referenceId: input.idempotentId,
        pixKeyType: PIX_KEY_TYPE_MAP[input.pixKeyType] || "EVP",
        pixKey: input.pixKey,
      },
    }
  );
  return { externalReference: payout.id, status: mapSttartPayoutStatus(payout.status) };
}

export interface SttartPayoutStatus {
  externalReference: string;
  status: string;
}

export async function getPayoutStatus(payoutId: string): Promise<SttartPayoutStatus> {
  const { payout } = await sttartFetch<{ payout: { id: string; status: string } }>(
    `/v1/api/cash-out/payouts/${payoutId}`,
    { method: "GET" }
  );
  return { externalReference: payout.id, status: mapSttartPayoutStatus(payout.status) };
}
