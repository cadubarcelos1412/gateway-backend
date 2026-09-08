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
  apiTransactionId: string;
  txid: string;
  emv: string;
}

export interface CreateDynamicPixInput {
  amountBRL: number;
  payerName: string;
  /**
   * Opcional (Pix "só telefone", ver TransactionService.createTransactionCore).
   * ⚠️ Não confirmado ao vivo ainda: a BR Code do Bacen permite `devedor` sem
   * CPF/CNPJ numa cobrança dinâmica, e a Sttart não documenta o campo como
   * obrigatório — mas essa integração nunca testou omitir `debtor.cpf/cnpj`
   * com dinheiro real. Validar com uma cobrança de valor baixo antes de
   * confiar nisso em produção (mesmo cuidado já aplicado ao resto da Sttart).
   */
  payerDocument?: string;
  externalReference: string;
  expirationSeconds: number;
}

export interface CreateDynamicPixResult {
  referenceCode: string;
  /**
   * `apiTransactionId` da Sttart — confirmado ao vivo (2026-08-31, 2
   * pagamentos reais) que é ESSE valor, não o `txid`, que vem em
   * `resource.id` no webhook `transaction.succeeded`. O evento
   * `transaction.created` usa o `txid`. Sem guardar os dois, a confirmação
   * de pagamento nunca bate com a transação certa — guardar aqui pra
   * transaction.service.ts persistir em Transaction.secondaryExternalId.
   */
  secondaryReferenceCode: string;
  pixCode: string;
  qrCodeBase64: string;
}

async function emvToQrCodeBase64(emv: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(emv, { errorCorrectionLevel: "M", margin: 1 });
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

export async function createDynamicPix(input: CreateDynamicPixInput): Promise<CreateDynamicPixResult> {
  const documentField = input.payerDocument
    ? input.payerDocument.replace(/\D/g, "").length > 11
      ? { cnpj: input.payerDocument }
      : { cpf: input.payerDocument }
    : {};

  const result = await sttartFetch<SttartDynamicPixResponse>("/v1/api/cash-in/pix/dynamic", {
    method: "POST",
    body: {
      debtor: {
        name: input.payerName,
        ...documentField,
      },
      amount: { original: input.amountBRL, changeType: 0 },
      calendar: { expiration: input.expirationSeconds },
      clientRequestId: input.externalReference,
    },
  });

  const qrCodeBase64 = await emvToQrCodeBase64(result.emv);

  return {
    referenceCode: result.txid,
    secondaryReferenceCode: result.apiTransactionId,
    pixCode: result.emv,
    qrCodeBase64,
  };
}

// GET /v1/api/cash-in/pix/{txid} confirmado ao vivo (2026-08-31, várias
// chamadas reais) — aceita o txid normalmente, doc antiga já pode ser
// ignorada.
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
