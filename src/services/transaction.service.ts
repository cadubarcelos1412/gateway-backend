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

// 🧾 Importa serviço contábil (ledger dupla-entrada)
import { postLedgerEntries } from "./ledger/ledger.service";
import { dispatchWebhookEvent } from "./webhook.service";
import { toPublicPayment } from "../utils/publicPayment";

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

    // Idempotência (campo interno, dedup por chave independente do header HTTP)
    if (idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey }).lean();
      if (existing) {
        return { transaction: existing as unknown as ITransaction, acquirer: (seller as any).acquirer || "pagarme" };
      }
    }

    if (customer.document === seller.documentNumber) {
      throw new Error("Comprador não pode ser o mesmo que o vendedor.");
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

      return { transaction: tx, acquirer: "test" };
    }

    /* ---------------------------------------------------------------- */
    /* 💳 Modo live — fluxo real (idêntico ao comportamento anterior)    */
    /* ---------------------------------------------------------------- */
    const wallet = await Wallet.findOne({ userId: seller.userId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    const { flags: riskFlags, level: riskLevel } = RiskEngine.evaluate({ amount, ip, seller });

    const acquirerKey = (seller as any).acquirer || "pagarme";
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

    try {
      const result = await acquirer.createTransaction(dto);
      externalId = result.externalId;
      postbackUrl = result.postbackUrl || postbackUrl;
      paymentDetails = result.paymentDetails;
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
      throw new Error("Erro ao criar transação na adquirente.");
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

    const { retentionAmount, availableIn } = await RetentionEngine.calculate({
      method,
      netAmount,
      riskLevel,
      settlementDaysOverride: feeTable?.settlementDays,
    });

    // 🤝 Split de pagamentos — parcerias ativas do seller pagador. O corte de
    // cada uma sai do netAmount; a retenção por risco continua incidindo só
    // sobre a parte que fica com o seller pagador (o risco avaliado é dele).
    const splitRules = await SplitRule.find({ payingSellerId: seller._id, status: "active" }).session(session);
    const splitAllocations = splitRules.map((rule) => ({
      recipientSellerId: rule.recipientSellerId as Types.ObjectId,
      percentage: rule.percentage,
      amount: round(netAmount * (rule.percentage / 100)),
    }));
    const totalSplitAmount = round(splitAllocations.reduce((sum, a) => sum + a.amount, 0));
    const sellerShare = round(netAmount - totalSplitAmount);

    const [tx] = await Transaction.create(
      [
        {
          userId: seller.userId,
          productId: product ? (product._id as Types.ObjectId) : undefined,
          amount,
          fee,
          netAmount,
          retention: retentionAmount,
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

    try {
      await postLedgerEntries(
        [
          { account: "contas_a_receber_adquirente", type: "debit", amount },
          { account: "passivo_seller", type: "credit", amount: sellerShare },
          ...splitAllocations.map((a) => ({
            account: "passivo_seller",
            type: "credit" as const,
            amount: a.amount,
            sellerId: a.recipientSellerId.toString(),
          })),
          { account: "receita_taxa_kissa", type: "credit", amount: fee },
        ],
        {
          idempotencyKey: `txn:${(tx._id as Types.ObjectId).toString()}`,
          transactionId: (tx._id as Types.ObjectId).toString(),
          sellerId: (seller._id as Types.ObjectId).toString(),
          source: { system: "transactions", acquirer: acquirerKey, ip },
          eventAt: tx.createdAt,
        }
      );
    } catch (ledgerErr) {
      console.error("❌ Erro ao registrar lançamentos contábeis:", ledgerErr);
      throw new Error("Erro ao registrar lançamentos contábeis (ledger).");
    }

    // 🤝 Créditos das parcerias de split — cada recipient recebe direto na
    // própria carteira, sem a retenção por risco (que é sobre o perfil do
    // seller pagador, não do parceiro).
    if (splitAllocations.length > 0) {
      const recipientSellers = await Seller.find({
        _id: { $in: splitAllocations.map((a) => a.recipientSellerId) },
      }).session(session);
      const sellerIdToUserId = new Map(recipientSellers.map((s) => [String(s._id), s.userId]));

      for (const allocation of splitAllocations) {
        const recipientUserId = sellerIdToUserId.get(String(allocation.recipientSellerId));
        if (!recipientUserId) continue; // segurança — não deveria acontecer, regra já valida na criação

        const recipientWallet = await Wallet.findOne({ userId: recipientUserId }).session(session);
        if (!recipientWallet) continue;

        recipientWallet.balance.unAvailable.push({ amount: allocation.amount, availableIn });
        recipientWallet.log.push({
          transactionId: tx._id as Types.ObjectId,
          type: "topup",
          method: method === "credit_card" ? "card" : method === "boleto" ? "bill" : "pix",
          amount: allocation.amount,
          security: { createdAt: new Date(), ipAddress: ip, userAgent, riskFlags: [] },
        });
        await recipientWallet.save({ session });
      }
    }

    wallet.balance.unAvailable.push({
      amount: sellerShare - retentionAmount,
      availableIn,
    });

    wallet.log.push({
      transactionId: tx._id as Types.ObjectId,
      type: "topup",
      method: method === "credit_card" ? "card" : method === "boleto" ? "bill" : "pix",
      amount: sellerShare - retentionAmount,
      security: {
        createdAt: new Date(),
        ipAddress: ip,
        userAgent,
        riskFlags,
      },
    });

    const savePromises: Promise<unknown>[] = [wallet.save({ session })];
    if (product) {
      product.sales.pending += 1;
      savePromises.push(product.save({ session }));
    }
    await Promise.all(savePromises);

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
      retentionDays: Math.round((availableIn.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    });

    void dispatchWebhookEvent(String(seller._id), "payment.created", toPublicPayment(tx));

    return { transaction: tx, acquirer: acquirerKey };
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
      input: parsed.data,
      ip,
      userAgent,
      mode: "live",
    });
  }
}
