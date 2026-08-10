import { IAcquirer } from "./IAcquirer";
import { CreateTransactionDTO, CreateTransactionResult } from "./types";
import { createPix } from "../lib/zendry/pix";
import { createCardPayment } from "../lib/zendry/card";
import { computeCardTotal, MAX_CARD_INSTALLMENTS } from "../lib/zendry/status-mapper";
import type { ZendryThreedsData } from "../lib/zendry/types";
import crypto from "crypto";

// Campos que a Zendry exige dentro de threeds_data (ver ZENDRY-MIGRATION.md,
// seção "Cartão — 3DS"). Validados aqui porque o DTO compartilhado
// (CreateTransactionDTO.threedsData) é só um Record<string,string> genérico.
const REQUIRED_THREEDS_FIELDS: (keyof ZendryThreedsData)[] = [
  "operation_session_id",
  "cavv",
  "xid",
  "eci",
  "secure_version",
  "directory_server_transaction_id",
  "three_ds_server_transaction_id",
  "ip_address",
  "user_agent_browser_value",
  "http_browser_language",
  "http_browser_screen_height",
  "http_browser_screen_width",
  "zip_code",
];

function assertThreedsData(data: Record<string, string> | undefined): ZendryThreedsData {
  if (!data) {
    throw new Error("Dados de 3DS (threedsData) ausentes para pagamento com cartão via Zendry.");
  }
  const missing = REQUIRED_THREEDS_FIELDS.filter((field) => !data[field]);
  if (missing.length > 0) {
    throw new Error(`Campo threedsData incompleto: faltando ${missing.join(", ")}.`);
  }
  return data as unknown as ZendryThreedsData;
}

/**
 * 🏦 ZendryAcquirer — Adapter para a Zendry (https://api.zendry.com.br).
 * Pix: QR Code + copia-e-cola gerado direto (POST /v1/pix/qrcodes).
 * Cartão: adquirente direto (número/CVV no nosso backend), 3DS obrigatório
 * — o `threedsData` já deve chegar calculado por um SDK client-side.
 *
 * Sem sandbox confirmado: toda chamada aqui é contra produção da Zendry.
 */
export class ZendryAcquirer implements IAcquirer {
  async createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult> {
    if (payload.method === "pix") {
      return this.createPixTransaction(payload);
    }
    if (payload.method === "credit_card") {
      return this.createCardTransaction(payload);
    }
    throw new Error(`Zendry não suporta o método de pagamento "${payload.method}".`);
  }

  private async createPixTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult> {
    const externalReference = payload.idempotencyKey || crypto.randomUUID();

    let result;
    try {
      result = await createPix({
        amountBRL: payload.amount,
        payerName: payload.customer.name,
        payerDocument: payload.customer.document,
        externalReference,
        expirationSeconds: 1800,
      });
    } catch (err) {
      console.error("❌ Zendry (pix) falhou:", err);
      const message = err instanceof Error ? err.message : "Erro ao criar cobrança Pix na Zendry.";
      throw new Error(message);
    }

    return {
      externalId: result.referenceCode,
      postbackUrl: payload.postbackUrl,
      paymentDetails: {
        pixCode: result.pixCode,
        pixQrCodeBase64: result.qrCodeBase64,
      },
    };
  }

  private async createCardTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult> {
    if (!payload.card) {
      throw new Error("Dados de cartão ausentes para pagamento via Zendry.");
    }
    if (payload.card.installments < 1 || payload.card.installments > MAX_CARD_INSTALLMENTS) {
      throw new Error(`Número de parcelas inválido (máximo ${MAX_CARD_INSTALLMENTS}x).`);
    }

    const threedsData = assertThreedsData(payload.threedsData);

    // Sobretaxa de parcela é repasse ao CLIENTE (o que ele paga no cartão) —
    // nunca altera o amount/fee/netAmount do seller, que continuam com base
    // no valor "cru" do pedido (payload.amount).
    const cardChargedAmount = computeCardTotal(payload.amount, payload.card.installments);

    let result;
    try {
      result = await createCardPayment({
        externalId: payload.idempotencyKey || crypto.randomUUID(),
        amountBRL: cardChargedAmount,
        cardNumber: payload.card.number,
        cardExpirationDate: payload.card.expirationDate,
        cardSecurityCode: payload.card.securityCode,
        cardHolderName: payload.card.holderName,
        cardHolderDocument: payload.customer.document,
        installments: payload.card.installments,
        threedsData,
      });
    } catch (err) {
      // Nunca propaga o corpo bruto do erro pra cima — pode, em teoria,
      // ecoar dados da requisição (que tem número de cartão/CVV). Detalhe
      // completo só no log do servidor, nunca em registro persistido
      // (TransactionAuditService grava a mensagem que subir daqui).
      console.error("❌ Zendry (cartão) falhou:", err);
      throw new Error("Erro de conexão com o gateway de pagamento (cartão).");
    }

    if (result.status === "waiting_3ds_authentication") {
      throw new Error("Esse cartão exige uma etapa extra de segurança (3DS). Tente outro cartão ou pague com Pix.");
    }
    if (result.status !== "accepted") {
      throw new Error("Pagamento recusado pela operadora do cartão.");
    }

    return {
      externalId: result.muid,
      postbackUrl: payload.postbackUrl,
      // Chegou até aqui só se result.status === "accepted" (qualquer outro
      // valor já lançou erro acima) — a Zendry não manda webhook nem tem
      // endpoint de consulta confirmado pra cartão, então "approved" tem
      // que ser aplicado agora, síncrono, ou a transação nunca sai de
      // "pending".
      synchronouslyApproved: true,
      paymentDetails: {
        cardLastDigits: result.lastDigits,
        cardBrand: result.brand,
        cardAuthorizationCode: result.authorizationCode,
        cardChargedAmount,
      },
    };
  }

  /**
   * NÃO IMPLEMENTADO DE PROPÓSITO — ver src/lib/zendry/card.ts, comentário
   * final: cancelamento/estorno de cartão e devolução de Pix nunca foram
   * confirmados contra a API real da Zendry durante o desenvolvimento deste
   * projeto. Lançar um erro claro aqui é melhor do que fingir que o estorno
   * aconteceu — RefundService depende disso pra NUNCA reverter ledger/wallet
   * sem confirmação real de que o dinheiro voltou pro comprador.
   *
   * Pra habilitar: confirme com o suporte da Zendry (a) o endpoint de
   * cancelamento/estorno de card_payments (método, payload, resposta) e (b)
   * o endpoint de devolução de Pix — são fluxos distintos — e implemente
   * cada um aqui.
   */
  async refund(): Promise<any> {
    throw new Error(
      "Estorno na Zendry ainda não confirmado com o suporte (nem para cartão, nem para Pix). " +
        "Não implementado de propósito — ver comentário em zendry.acquirer.ts."
    );
  }
}
