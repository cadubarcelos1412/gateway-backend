import { Request } from "express";
import crypto from "crypto";
import { ClientSession, Types } from "mongoose";
import { decodeToken } from "../config/auth";

import { Seller, ISeller } from "../models/seller.model";
import { Wallet } from "../models/wallet.model";
import { SplitRule } from "../models/splitRule.model";
import { Product } from "../models/product.model";
import { Transaction, ITransaction } from "../models/transaction.model";

import { calculatePixTax, round } from "../utils/fees";
import { transactionSchema } from "../validation/transaction.schema";
import { normalizeCardBrand } from "../models/feeTable.types";

import { RiskEngine } from "./riskEngine";
import { RetentionEngine } from "./retentionEngine";
import { TransactionAuditService } from "./transactionAudit.service";

import { resolveAcquirer } from "../acquirers";
import { CreateTransactionDTO, CreateTransactionResult, PaymentMethod } from "../acquirers/types";

import { dispatchWebhookEvent } from "./webhook.service";
import { toPublicPayment } from "../utils/publicPayment";
import { applyZendryPaymentStatus } from "./zendryPaymentStatus.service";

export type TransactionMode = "test" | "live";

export interface CreateTransactionInput {
  amount: number; // 💰 em reais
  method: PaymentMethod;
  productId?: string;
  description?: string;
  idempotencyKey?: string | null;
  customer: {
    name: string;
    email: string;
    document: string;
    phone?: string;
  };
  card?: CreateTransactionDTO["card"];
  threedsData?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

interface CreateTransactionCoreParams {
  seller: ISeller;
  session: ClientSession;
  input: CreateTransactionInput;
  ip: string;
  userAgent: string;
  mode: TransactionMode;
}

function buildMockPaymentDetails(method: PaymentMethod) {
  if (method === "pix") {
    return {
      pixCode: `00020126TESTMODE${crypto.randomBytes(10).toString("hex")}5204000053039865802BR6009SAO PAULO`,
      pixQrCodeBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    };
  }
  if (method === "credit_card") {
    return {
      cardLastDigits: "4242",
      cardBrand: "visa",
      cardAuthorizationCode: `test_auth_${crypto.randomBytes(6).toString("hex")}`,
    };
  }
  return {};
}

export class TransactionService {
  /**
   * Núcleo do fluxo de criação de transação — usado tanto pelo dashboard
   * (JWT do seller, sempre mode "live") quanto pela API pública /v1/payments
   * (API key, mode "test" ou "live" conforme a chave usada).
   *
   * Em mode "test" a transação NUNCA chama a adquirente real nem toca
   * ledger/wallet — é inteiramente simulada, isolada do dinheiro de verdade.
   * Quem confirma/reprova é o endpoint de simulação (/v1/test/payments/:id/pay).
   */
  static async createTransactionCore(params: CreateTransactionCoreParams) {
    const { seller, session, input, ip, userAgent, mode } = params;
    const { amount, method, productId, description, customer, idempotencyKey, card, threedsData, metadata } = input;

    // 🔒 Limite observado, não documentado oficialmente pela Zendry (não há
    // sandbox confirmado — ver .env): confirmado em 2026-08-12 via log de
    // auditoria que Pix abaixo de R$5,00 falha com 500 genérico
    // ("Operation failed! Please try again or contact our support team"),
    // enquanto R$5,00+ funciona normal. Um teste real de R$1,00 tinha
    // funcionado em 2026-08-08 (seller diferente) — ou seja, esse valor pode
    // não ser fixo/documentado pela Zendry; se voltar a mudar, ajuste aqui.
    if (method === "pix" && amount < 5) {
      const err = new Error("O valor mínimo para pagamento via Pix é de R$ 5,00.");
      (err as Error & { code?: string }).code = "amount_below_minimum";
      throw err;
    }

    // Idempotência (campo interno, dedup por chave independente do header HTTP)
    if (idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey }).lean();
      if (existing) {
        // false de propósito — é uma transação JÁ existente (dedup por
        // idempotencyKey), a aprovação síncrona (se houve) já foi aplicada
        // na requisição original que a criou. Reaplicar aqui seria a
        // segunda vez pro mesmo pagamento.
        return { transaction: existing as unknown as ITransaction, acquirer: (seller as any).acquirer || "zendry", synchronouslyApproved: false };
      }
    }

    if (customer.document === seller.documentNumber) {
      // code anexado pro caller (API pública /v1/payments) conseguir mapear
      // pra um código de erro específico em vez do genérico
      // "payment_creation_failed" — permite integradores tratarem esse caso
      // com uma mensagem própria em vez de mostrar o erro cru pro comprador.
      const err = new Error(
        "O CPF/CNPJ do comprador é o mesmo cadastrado como vendedor nesta loja. Use um documento diferente para continuar."
      );
      (err as Error & { code?: string }).code = "self_payment_not_allowed";
      throw err;
    }

    const product = productId ? await Product.findById(productId) : null;
    if (productId && !product) {
      throw new Error("Produto não encontrado.");
    }

    const chargeDescription =
      description || (product ? `Venda do produto: ${product.name}` : "Cobrança via API");

    /* ---------------------------------------------------------------- */
    /* 🧪 Modo teste — 100% simulado, nunca move dinheiro real           */
    /* ---------------------------------------------------------------- */
    if (mode === "test") {
      const [tx] = await Transaction.create(
        [
          {
            userId: seller.userId,
            productId: product ? (product._id as Types.ObjectId) : undefined,
            amount,
            fee: 0,
            netAmount: amount,
            retention: 0,
            type: "deposit",
            method,
            status: "pending",
            mode: "test",
            description: chargeDescription,
            externalId: `test_${crypto.randomUUID()}`,
            idempotencyKey: idempotencyKey || null,
            createdAt: new Date(),
            paymentDetails: buildMockPaymentDetails(method),
            purchaseData: {
              customer,
              products: product ? [{ name: product.name, price: product.price }] : undefined,
            },
            metadata,
          },
        ],
        { session }
      );

      void dispatchWebhookEvent(String(seller._id), "payment.created", toPublicPayment(tx));

      return { transaction: tx, acquirer: "test", synchronouslyApproved: false };
    }

    /* ---------------------------------------------------------------- */
    /* 💳 Modo live — fluxo real (idêntico ao comportamento anterior)    */
    /* ---------------------------------------------------------------- */

    // 🪪 KYC — seller sem verificação aprovada não pode mover dinheiro real.
    // O checkout público já tinha essa trava (resolveCheckoutContext), mas
    // aqui é o núcleo compartilhado por TODOS os caminhos de pagamento live
    // (checkout, API pública /v1/payments e o fluxo legado do dashboard) —
    // sem ela, um seller que nunca envia nenhum documento de KYC ainda
    // conseguia processar pagamento real via API ou dashboard, só o link de
    // checkout público estava travado.
    if (seller.kycStatus !== "approved" && seller.kycStatus !== "active") {
      const err = new Error(
        `Pagamento indisponível: verificação de identidade do vendedor com status '${seller.kycStatus}'. Complete o envio dos documentos de KYC para operar.`
      );
      (err as Error & { code?: string }).code = "kyc_not_approved";
      throw err;
    }

    const wallet = await Wallet.findOne({ userId: seller.userId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    const { flags: riskFlags, level: riskLevel } = RiskEngine.evaluate({ amount, ip, seller });

    const acquirerKey = (seller as any).acquirer || "zendry";
    const acquirer = resolveAcquirer(acquirerKey);

    const dto: CreateTransactionDTO = {
      amount,
      currency: "brl",
      method,
      description: chargeDescription,
      idempotencyKey: idempotencyKey || undefined,
      product: {
        id: product ? (product._id as Types.ObjectId).toString() : "external",
        name: product?.name || chargeDescription,
        price: product?.price,
      },
      customer: {
        name: customer.name,
        email: customer.email,
        document: customer.document,
        phone: customer.phone || undefined,
        ip,
      },
      postbackUrl: `${process.env.BASE_URL}/api/transactions/webhook`,
      metadata: {
        sellerId: (seller._id as Types.ObjectId).toString(),
      },
      card,
      threedsData,
    };

    let externalId = "";
    let postbackUrl = dto.postbackUrl;
    let paymentDetails: CreateTransactionResult["paymentDetails"];
    let synchronouslyApproved = false;

    try {
      const result = await acquirer.createTransaction(dto);
      externalId = result.externalId;
      postbackUrl = result.postbackUrl || postbackUrl;
      paymentDetails = result.paymentDetails;
      synchronouslyApproved = result.synchronouslyApproved ?? false;
    } catch (err: any) {
      await TransactionAuditService.log({
        sellerId: seller._id as Types.ObjectId,
        userId: seller.userId,
        amount,
        method,
        status: "failed",
        kycStatus: seller.status,
        ipAddress: ip,
        userAgent,
        buyerDocument: customer.document,
        flags: ["FAILED_ATTEMPT", ...riskFlags],
        description: err?.message || "Erro desconhecido",
        riskLevel,
      });
      throw new Error("Não foi possível gerar o pagamento agora. Tente novamente em alguns instantes.");
    }

    // 💳 Taxa calculada aqui (depois da adquirente responder) porque cartão só
    // revela a bandeira real no retorno (paymentDetails.cardBrand) — pix não
    // depende disso, mas segue o mesmo ponto no código pra manter um único
    // caminho em vez de duas ramificações duplicadas.
    const feeTable = seller.feeTable;
    let fee: number;
    if (method === "pix" && !feeTable) {
      // Fallback só pra sellers antigos sem feeTable ainda (deve sumir após backfill).
      const fixed = seller?.split?.cashIn?.pix?.fixed || 0;
      const percentage = seller?.split?.cashIn?.pix?.percentage || 0;
      fee = round(calculatePixTax(amount, fixed, percentage));
    } else if (method === "pix") {
      fee = round(calculatePixTax(amount, 0, feeTable!.pixIn.percentage));
    } else if (method === "credit_card") {
      const installments = card?.installments || 1;
      if (feeTable) {
        const brand = normalizeCardBrand(paymentDetails?.cardBrand);
        const pct = feeTable.cardFees[brand][String(installments)] ?? feeTable.cardFees.standard["1"];
        fee = round(calculatePixTax(amount, 0, pct));
      } else {
        const fixed = seller?.split?.cashIn?.credit_card?.fixed || 0;
        const percentage = seller?.split?.cashIn?.credit_card?.percentage || 0;
        fee = round(calculatePixTax(amount, fixed, percentage));
      }
    } else {
      // boleto — segue o modelo antigo, fora do escopo da tabela nova.
      const fixed = seller?.split?.cashIn?.boleto?.fixed || 0;
      const percentage = seller?.split?.cashIn?.boleto?.percentage || 0;
      fee = round(calculatePixTax(amount, fixed, percentage));
    }
    const netAmount = round(amount - fee);

    const { retentionAmount, days: retentionDays } = await RetentionEngine.calculate({
      method,
      netAmount,
      riskLevel,
      // feeTable.settlementDays é o prazo de liquidação do CARTÃO — nunca
      // deve sobrepor o D0 do Pix (nem o D+3 padrão do boleto). Só cartão é
      // antecipável; Pix cai direto disponível.
      settlementDaysOverride: method === "credit_card" ? feeTable?.settlementDays : undefined,
    });

    // 🤝 Split de pagamentos — parcerias ativas do seller pagador. Só
    // registrado aqui (em metadata.splits) — o crédito de verdade pro
    // seller e pros parceiros só acontece quando a transação é
    // CONFIRMADA (ver applyZendryPaymentStatus), nunca nesta criação.
    // Nome do destinatário é "snapshotado" aqui (igual recipientEmail no
    // SplitRule) pra Vendas/Dashboard do pagador mostrarem "repassado pra
    // Fulano" sem precisar de join toda vez que listam transações.
    // Filtro defensivo em revokeEffectiveAt (além do "status: active") — o
    // sweep periódico (revokeMaturedSplitRules) é quem normalmente já vira
    // o status pra "revoked" quando a carência passa, mas isso aqui garante
    // que nenhuma venda pague split de uma parceria revogada mesmo se o
    // sweep atrasar por qualquer motivo.
    const splitRules = (
      await SplitRule.find({ payingSellerId: seller._id, status: "active" }).session(session)
    ).filter((r) => !r.revokeEffectiveAt || r.revokeEffectiveAt.getTime() > Date.now());
    const recipientSellersById = splitRules.length
      ? new Map(
          (
            await Seller.find({ _id: { $in: splitRules.map((r) => r.recipientSellerId) } })
              .select("name")
              .session(session)
          ).map((s) => [String(s._id), s.name])
        )
      : new Map<string, string>();
    const splitAllocations = splitRules.map((rule) => ({
      recipientSellerId: rule.recipientSellerId as Types.ObjectId,
      recipientName: recipientSellersById.get(String(rule.recipientSellerId)) || rule.recipientEmail,
      percentage: rule.percentage,
      amount: round(netAmount * (rule.percentage / 100)),
    }));

    // 🚨 Crédito em wallet/ledger acontece SÓ quando a transação é de fato
    // aprovada (ver applyZendryPaymentStatus, ramo newlyApproved) — nunca
    // aqui na criação. Corrigido em 2026-08-10: até essa data, toda
    // transação "pending" (Pix gerado mas nunca pago, ex.: comprador
    // abandonou o checkout) já entrava direto em wallet.balance.unAvailable
    // como se o dinheiro já tivesse sido recebido — e como Pix é D+0
    // (ver RetentionEngine), a liberação automática de saldo (ver
    // wallet.service.ts) fazia esse valor virar saldo DISPONÍVEL/SACÁVEL em
    // minutos, mesmo sem o comprador ter pago nada. Achado com R$10.440,11
    // de saldo fantasma em produção — ver scripts/check-wallet-vs-approved-all.mjs.
    const [tx] = await Transaction.create(
      [
        {
          userId: seller.userId,
          productId: product ? (product._id as Types.ObjectId) : undefined,
          amount,
          fee,
          netAmount,
          retention: retentionAmount,
          retentionDays,
          type: "deposit",
          method,
          status: "pending",
          mode: "live",
          description: dto.description,
          externalId,
          postback: postbackUrl,
          riskFlags,
          idempotencyKey: idempotencyKey || null,
          createdAt: new Date(),
          paymentDetails,
          purchaseData: {
            customer,
            products: product ? [{ name: product.name, price: product.price }] : undefined,
          },
          metadata: splitAllocations.length > 0 ? { ...metadata, splits: splitAllocations } : metadata,
        },
      ],
      { session }
    );

    if (product) {
      product.sales.pending += 1;
      await product.save({ session });
    }

    await TransactionAuditService.log({
      transactionId: tx._id as Types.ObjectId,
      sellerId: seller._id as Types.ObjectId,
      userId: seller.userId,
      amount,
      method,
      status: "pending",
      kycStatus: seller.status,
      ipAddress: ip,
      userAgent,
      buyerDocument: customer.document,
      flags: riskFlags,
      description: "Transação criada e aguardando aprovação.",
      riskLevel,
      retentionAmount,
      retentionDays,
    });

    void dispatchWebhookEvent(String(seller._id), "payment.created", toPublicPayment(tx));

    // "synchronouslyApproved" só descreve o que a adquirente respondeu — a
    // transação em si continua salva como "pending" aqui (Transaction.create
    // acima). Quem chama precisa aplicar o "approved" de verdade DEPOIS do
    // commit desta sessão (ver applyZendryPaymentStatus), nunca aqui dentro:
    // é uma chamada que credita ledger/wallet numa segunda transação Mongo
    // própria, e não pode ficar aninhada dentro de uma sessão que ainda
    // pode abortar.
    return { transaction: tx, acquirer: acquirerKey, synchronouslyApproved };
  }

  /**
   * Chamar SEMPRE depois do commit da sessão que criou a transação (nunca
   * de dentro dela) — aplica o "approved" de verdade (ledger + wallet) pra
   * transações que a adquirente já confirmou de forma síncrona (hoje: só
   * cartão via Zendry, ver synchronouslyApproved em createTransactionCore).
   * Sem isso, essas transações ficavam "pending" pra sempre — a Zendry não
   * manda webhook nem tem endpoint de consulta confirmado pra cartão, então
   * nada nunca chegava a corrigir o status depois (achado em produção,
   * 2026-08-10, primeira venda real por cartão da plataforma).
   */
  static async finalizeSyncApprovalIfNeeded(transaction: ITransaction, synchronouslyApproved: boolean): Promise<void> {
    if (!synchronouslyApproved || transaction.mode !== "live" || !transaction.externalId) return;
    try {
      await applyZendryPaymentStatus(transaction.externalId, "approved");
    } catch (err) {
      console.error(
        `❌ CRÍTICO: transação ${(transaction._id as Types.ObjectId).toString()} confirmada pela adquirente mas falhou ao aplicar "approved" — precisa reconciliação manual:`,
        err
      );
    }
  }

  /**
   * Fluxo legado: resolve o seller a partir do JWT do dashboard e valida o
   * body via `transactionSchema` (productId obrigatório) — comportamento
   * inalterado em relação ao que já existia antes da API pública. Usado só
   * por POST /api/transactions/create.
   */
  static async createTransaction(req: Request, session: ClientSession) {
    const token = req.headers.authorization;
    if (!token) throw new Error("Token ausente.");

    const payload = await decodeToken(token.replace("Bearer ", ""));
    const seller = await Seller.findOne({ userId: payload?.id });
    if (!seller) throw new Error("Seller não encontrado.");

    const parsed = transactionSchema.safeParse(req.body);
    if (!parsed.success) throw new Error("Payload inválido.");

    const forwarded = req.headers["x-forwarded-for"];
    const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.ip || "";
    const userAgent = (req.headers["user-agent"] as string) || "unknown";

    return this.createTransactionCore({
      seller,
      session,
      // "source" identifica a origem na tela de vendas — este fluxo é
      // sempre criado pelo próprio seller autenticado no dashboard.
      input: { ...parsed.data, metadata: { source: "dashboard" } },
      ip,
      userAgent,
      mode: "live",
    });
  }
}
