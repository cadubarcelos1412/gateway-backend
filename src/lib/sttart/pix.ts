import { sttartFetch } from "./client";
import { mapSttartTransactionStatus } from "./status-mapper";

// Cash-in — Pix dinâmico (POST /v1/api/cash-in/pix/dynamic). Cobrança
// SEMPRE em BRL (por isso nunca mandamos currency/quotationId — isso é só
// pra cobrança denominada em moeda estrangeira, fora do nosso caso hoje).
//
// A Sttart devolve `qrCodeUrl` (link pra imagem), não a imagem em base64
// direto. O resto do sistema (publicPayment.ts, transaction.service.ts)
// espera sempre um base64 (mesmo contrato que a Zendry já devolve pronto,
// ver lib/zendry/pix.ts) — pra não ter que mexer em checkout/API pública
// só por causa dessa diferença de formato entre adquirentes, baixamos a
// imagem aqui e convertemos, mantendo o mesmo shape de retorno da Zendry.

interface SttartDynamicPixResponse {
  id: string;
  amount: number;
  txid: string;
  emv: string;
  qrCodeUrl: string;
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

async function fetchQrCodeAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar QR Code Pix da Sttart (${res.status}).`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString("base64");
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
      amount: { original: input.amountBRL, changeType: "NONE" },
      calendar: { expiration: input.expirationSeconds },
      clientRequestId: input.externalReference,
    },
  });

  const qrCodeBase64 = await fetchQrCodeAsBase64(result.qrCodeUrl);

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
