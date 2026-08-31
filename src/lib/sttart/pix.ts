import QRCode from "qrcode";
import { sttartFetch } from "./client";
import { mapSttartTransactionStatus } from "./status-mapper";

// Cash-in — Pix dinâmico (POST /v1/api/cash-in/pix/dynamic). Cobrança
// SEMPRE em BRL (por isso nunca mandamos currency/quotationId — isso é só
// pra cobrança denominada em moeda estrangeira, fora do nosso caso hoje).
//
// Confirmado ao vivo com uma cobrança real de R$1 (2026-08-31): a resposta
// NÃO traz `qrCodeUrl` nenhum, só o `emv` (código copia-e-cola). O resto do
// sistema (publicPayment.ts, transaction.service.ts) espera sempre um
// base64 de imagem (mesmo contrato que a Zendry já devolve pronto, ver
// lib/zendry/pix.ts) — então geramos o QR Code aqui mesmo, a partir do
// texto EMV, em vez de baixar uma imagem que a Sttart não fornece.
//
// `amount.changeType` também confirmado ao vivo: precisa ser NÚMERO (0 =
// valor não pode ser alterado pelo pagador, no padrão BR Code do Bacen),
// não a string que a doc sugeria — a Sttart rejeita com 400 se mandar string.

interface SttartDynamicPixResponse {
  id: string;
  txid: string;
  emv: string;
}

export interface CreateDynamicPixInput {
  amountBRL: number;
  payerName: string;
  payerDocument: string;
  externalReference: string;
  expirationSeconds: number;
}

export interface CreateDynamicPixResult {
  referenceCode: string;
  pixCode: string;
  qrCodeBase64: string;
}

async function emvToQrCodeBase64(emv: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(emv, { errorCorrectionLevel: "M", margin: 1 });
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

export async function createDynamicPix(input: CreateDynamicPixInput): Promise<CreateDynamicPixResult> {
  const isCnpj = input.payerDocument.replace(/\D/g, "").length > 11;

  const result = await sttartFetch<SttartDynamicPixResponse>("/v1/api/cash-in/pix/dynamic", {
    method: "POST",
    body: {
      debtor: {
        name: input.payerName,
        ...(isCnpj ? { cnpj: input.payerDocument } : { cpf: input.payerDocument }),
      },
      amount: { original: input.amountBRL, changeType: 0 },
      calendar: { expiration: input.expirationSeconds },
      clientRequestId: input.externalReference,
    },
  });

  const qrCodeBase64 = await emvToQrCodeBase64(result.emv);

  return {
    referenceCode: result.txid,
    pixCode: result.emv,
    qrCodeBase64,
  };
}

// ⚠️ A doc da Sttart passada confirma GET /v1/api/cash-in/pix/e2e/{endToEndId}
// (lookup por End-to-End id do Pix, não pelo nosso txid/clientRequestId) —
// não temos confirmação de um endpoint de consulta direta por txid como
// este. Rota abaixo é a melhor suposição (espelha o padrão REST do resto da
// API) e PRECISA ser validada contra a doc real ou suporte da Sttart antes
// de confiar na reconciliação de cash-in — mesma desconfiança que já vale
// pro resto da integração Sttart, sem sandbox confirmado.
export interface SttartPixStatus {
  referenceCode: string;
  status: ReturnType<typeof mapSttartTransactionStatus>;
}

export async function getPixChargeStatus(txid: string): Promise<SttartPixStatus> {
  const result = await sttartFetch<{ txid: string; status: string }>(
    `/v1/api/cash-in/pix/${txid}`,
    { method: "GET" }
  );
  return { referenceCode: result.txid, status: mapSttartTransactionStatus(result.status) };
}
