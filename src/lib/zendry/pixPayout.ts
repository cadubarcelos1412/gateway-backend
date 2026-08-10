import { zendryFetch } from "./client";

// Envio real de Pix pra terceiros — POST /v1/pix/payments, documentado em
// developers.zendry.com.br/en/docs/payment/payment-register (lido em
// 2026-08-09, nunca integrado antes neste projeto — só existia o lado de
// RECEBER, ver pix.ts). Igual ao resto da API Zendry: sem sandbox
// confirmado, sem teste isolado feito antes de ligar pra sellers reais
// (decisão explícita do produto em 2026-08-09) — qualquer divergência entre
// esta doc e o comportamento real só vai aparecer no primeiro saque de
// verdade.
//
// O campo `authorized` que a Zendry aceita no registro NÃO é usado aqui pra
// controlar aprovação manual/automática — a doc não mostra nenhum endpoint
// pra autorizar depois um pagamento criado com authorized:false, o que
// sugere que isso dependeria do painel da própria Zendry (não confirmado).
// Em vez disso, SEMPRE mandamos authorized:true no momento em que JÁ
// decidimos executar o saque (ver cashout.service.ts) — o gate de "precisa
// aprovar" é inteiramente nosso (CashoutRequest + Seller.autoWithdrawEnabled),
// não da Zendry.
//
// receiver_name/receiver_document só são exigidos pela Zendry quando
// initiation_type = "manual" (saque por dados bancários) — pra "dict"
// (saque por chave Pix, o único modo que usamos) são opcionais, mas
// mandamos receiver_name quando temos (ajuda auditoria/disputa do lado
// deles).

export type ZendryPixKeyType = "phone" | "email" | "cpf" | "cnpj" | "token";

export interface SendPixPaymentInput {
  /** Identificador único do saque do nosso lado — evita duplicar envio em retry. */
  idempotentId: string;
  pixKeyType: ZendryPixKeyType;
  pixKey: string;
  receiverName?: string;
  valueCents: number;
}

export interface SendPixPaymentResult {
  referenceCode: string;
  status: string;
}

export async function sendPixPayment(input: SendPixPaymentInput): Promise<SendPixPaymentResult> {
  const { payment } = await zendryFetch<{
    payment: { reference_code: string; status: string };
  }>("/v1/pix/payments", {
    method: "POST",
    body: {
      initiation_type: "dict",
      idempotent_id: input.idempotentId,
      pix_key_type: input.pixKeyType,
      pix_key: input.pixKey,
      ...(input.receiverName ? { receiver_name: input.receiverName } : {}),
      value_cents: input.valueCents,
      authorized: true,
    },
  });
  return { referenceCode: payment.reference_code, status: payment.status };
}

export interface PixPaymentStatus {
  referenceCode: string;
  status: string;
}

// GET /v1/pix/payments/{reference_code} — diferente do Pix de entrada (sem
// consulta de status confirmada, só listagem paginada), aqui a Zendry
// documenta consulta direta por referência.
export async function getPixPaymentStatus(referenceCode: string): Promise<PixPaymentStatus> {
  const { payment } = await zendryFetch<{ payment: { reference_code: string; status: string } }>(
    `/v1/pix/payments/${referenceCode}`,
    { method: "GET" }
  );
  return { referenceCode: payment.reference_code, status: payment.status };
}
