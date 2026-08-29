import mongoose, { Types } from "mongoose";
import CashoutRequest, {
  ICashoutRequest,
  IWireDetails,
  IWireCompliance,
} from "../models/cashoutRequest.model";
import { Wallet } from "../models/wallet.model";
import { Seller, ISeller } from "../models/seller.model";
import { TransactionAuditService } from "./transactionAudit.service";
import { postLedgerEntries } from "./ledger/ledger.service";
import { round2 } from "./ledger/helpers";
import { getQuote } from "../lib/sttart/crypto";
import { DEFAULT_FEE_TABLE } from "../models/feeTable.types";
import { releaseMaturedBalance } from "./wallet.service";

/**
 * 🌐 Wire internacional (SWIFT) via Sttart — serviço PRÓPRIO, separado de
 * cashout.service.ts (pix/usdt/manual) por decisão explícita (ver plano de
 * integração 2026-08-29): a Sttart é só o dado `acquirer` gravado no
 * registro, NUNCA uma dependência de código aqui — o único ponto de contato
 * com `lib/sttart/*` é `getQuote`, usado só pra COTAR. Não existe API de
 * envio: o wire acontece manualmente no painel da Sttart, fora do PyxGate;
 * este serviço só cria, controla, audita e registra a operação.
 *
 * Modelo de câmbio (ponto mais delicado — ver plano):
 * - No PEDIDO, cota-se BRL↔moeda e trava-se um TETO (`maxBrlAmount`),
 *   congelado do saldo disponível na hora (mesma proteção que
 *   CashoutService.createCashout já usa pro Pix). `amount`/`fee`/`netAmount`
 *   começam iguais a esse teto (melhor estimativa disponível).
 * - Na CONFIRMAÇÃO (depois do envio manual de verdade), o master informa os
 *   valores REAIS executados. `amount`/`netAmount` são SOBRESCRITOS com o
 *   valor real (nunca pode passar do teto — validado); `fee` nunca muda
 *   (não varia com câmbio). A diferença entre o teto e o valor real
 *   executado volta pro saldo disponível.
 */

export interface CreateWireCashoutInput {
  foreignAmount: number;
  currency: "USD" | "EUR";
  beneficiary: IWireDetails["beneficiary"];
  bank: IWireDetails["bank"];
  intermediaryBank?: IWireDetails["intermediaryBank"];
  contact: IWireDetails["contact"];
  feeType: "SHA" | "OUR" | "BEN";
  invoice?: { url: string; mimeType?: string };
  invoiceData?: string;
}

async function sumWireAmountSince(userId: Types.ObjectId, since: Date): Promise<number> {
  const rows = await CashoutRequest.find({
    userId,
    rail: "wire",
    status: { $in: ["pending", "completed"] },
    createdAt: { $gte: since },
  }).select("amount");
  return round2(rows.reduce((sum, r) => sum + (r.amount || 0), 0));
}

export interface WireQuotePreview {
  quote: { baseCurrency: "USD" | "EUR"; rate: number; quotedAt: Date; expiresAt: Date; requestedForeignAmount: number };
  netAmountEstimated: number;
  fee: number;
  maxBrlAmount: number;
}

/**
 * Cota + calcula o teto SEM criar nada nem tocar no saldo — usado tanto
 * pela tela de pedido (mostrar o teto ANTES de confirmar, ver plano) quanto
 * por createWireCashout (mesma conta, sem duplicar lógica). Ainda valida
 * elegibilidade (wireEnabled/KYC/limites) — não faz sentido cotar pra quem
 * não pode nem pedir.
 */
async function quoteAndValidate(
  userId: Types.ObjectId,
  foreignAmount: number,
  currency: "USD" | "EUR"
): Promise<{ seller: ISeller; preview: WireQuotePreview }> {
  const seller = await Seller.findOne({ userId });
  if (!seller) throw new Error("Seller não encontrado.");
  if (!seller.wireEnabled) {
    throw new Error("Wire internacional não liberado para esta conta. Fale com o suporte.");
  }
  if (seller.kycStatus !== "approved" && seller.kycStatus !== "active") {
    throw new Error("Wire internacional exige verificação de identidade aprovada.");
  }
  if (!foreignAmount || foreignAmount <= 0) {
    throw new Error("Valor inválido.");
  }

  const quote = await getQuote(currency);
  if (!quote.unitPrice || quote.unitPrice <= 0) {
    throw new Error("Cotação indisponível no momento. Tente novamente em instantes.");
  }

  const wireOut = seller.feeTable?.wireOut ?? DEFAULT_FEE_TABLE.wireOut;
  const netAmountEstimated = round2(foreignAmount * quote.unitPrice);
  const fee = round2(wireOut.fixed + (netAmountEstimated * wireOut.percentage) / 100);
  const maxBrlAmount = round2(netAmountEstimated + fee);

  // 🚦 Limites por seller (estrutura pronta, sem UI de configuração ainda —
  // ver Seller.wireLimits). Ausente/undefined = sem limite.
  const limits = seller.wireLimits;
  if (limits?.perTransaction && maxBrlAmount > limits.perTransaction) {
    throw new Error(`Valor acima do limite por operação (R$ ${limits.perTransaction.toFixed(2)}).`);
  }
  if (limits?.daily) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const usedToday = await sumWireAmountSince(userId, startOfDay);
    if (round2(usedToday + maxBrlAmount) > limits.daily) {
      throw new Error(`Valor acima do limite diário de wire (R$ ${limits.daily.toFixed(2)}).`);
    }
  }
  if (limits?.monthly) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const usedThisMonth = await sumWireAmountSince(userId, startOfMonth);
    if (round2(usedThisMonth + maxBrlAmount) > limits.monthly) {
      throw new Error(`Valor acima do limite mensal de wire (R$ ${limits.monthly.toFixed(2)}).`);
    }
  }

  return {
    seller,
    preview: {
      quote: {
        baseCurrency: currency,
        rate: quote.unitPrice,
        quotedAt: new Date(),
        expiresAt: new Date(quote.expiresAt),
        requestedForeignAmount: foreignAmount,
      },
      netAmountEstimated,
      fee,
      maxBrlAmount,
    },
  };
}

export class WireCashoutService {
  /** Só cota/calcula — não cria nada, não toca no saldo. Ver quoteAndValidate. */
  static async previewWireQuote(userId: Types.ObjectId, foreignAmount: number, currency: "USD" | "EUR"): Promise<WireQuotePreview> {
    const { preview } = await quoteAndValidate(userId, foreignAmount, currency);
    return preview;
  }

  static async createWireCashout(
    userId: Types.ObjectId,
    input: CreateWireCashoutInput
  ): Promise<ICashoutRequest> {
    if (!input.invoice?.url && !input.invoiceData?.trim()) {
      throw new Error("Anexe a invoice (arquivo) ou preencha os dados da invoice.");
    }
    if (!input.beneficiary?.name || !input.beneficiary?.address) {
      throw new Error("Dados do beneficiário incompletos.");
    }
    if (!input.bank?.name || !input.bank?.swiftBic || !input.bank?.accountNumber) {
      throw new Error("Dados bancários do beneficiário incompletos (banco, SWIFT/BIC e conta são obrigatórios).");
    }
    if (!input.contact?.emailForCopy) {
      throw new Error("E-mail para cópia é obrigatório.");
    }

    const { seller, preview } = await quoteAndValidate(userId, input.foreignAmount, input.currency);
    const { quote: wireQuote, netAmountEstimated, fee, maxBrlAmount } = preview;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const wallet = await Wallet.findOne({ userId }).session(session);
      if (!wallet) throw new Error("Carteira não encontrada.");
      await releaseMaturedBalance(wallet, session);

      if (wallet.balance.available < maxBrlAmount) {
        throw new Error(
          `Saldo insuficiente pra cobrir esse wire mais a taxa. Teto estimado: R$${maxBrlAmount.toFixed(2)}, disponível: R$${wallet.balance.available.toFixed(2)}.`
        );
      }

      // ❄️ Congela o TETO — mesma proteção que createCashout (Pix) já usa
      // pra impedir o seller de gastar/sacar o mesmo dinheiro duas vezes
      // enquanto o pedido está pendente. Nenhum lançamento de ledger ainda
      // (só na confirmação, com o valor REAL).
      wallet.balance.available = round2(wallet.balance.available - maxBrlAmount);
      await wallet.save({ session });

      const [cashout] = await CashoutRequest.create(
        [
          {
            userId,
            rail: "wire",
            acquirer: "sttart",
            status: "pending",
            amount: maxBrlAmount, // estimativa inicial — sobrescrito na confirmação com o valor real
            fee,
            netAmount: netAmountEstimated,
            maxBrlAmount,
            wireQuote,
            wireDetails: {
              beneficiary: input.beneficiary,
              bank: input.bank,
              intermediaryBank: input.intermediaryBank,
              contact: input.contact,
              feeType: input.feeType,
              invoice: input.invoice ? { url: input.invoice.url, uploadedAt: new Date(), mimeType: input.invoice.mimeType } : undefined,
              invoiceData: input.invoiceData,
              currency: input.currency,
            },
          },
        ],
        { session }
      );

      await session.commitTransaction();

      await TransactionAuditService.log({
        transactionId: cashout._id as Types.ObjectId,
        sellerId: userId,
        userId,
        amount: maxBrlAmount,
        method: "pix", // AuditData.method não tem "wire" — mesma limitação já existente pro rail "usdt"
        status: "pending",
        kycStatus: seller.kycStatus,
        flags: [],
        description: `Pedido de wire internacional criado (teto R$${maxBrlAmount.toFixed(2)}, ${input.currency} ${input.foreignAmount}).`,
      });

      return cashout;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  /**
   * Confirmação — SÓ depois do wire já ter sido enviado manualmente no
   * painel da Sttart. Estritamente idempotente: só age se `status ===
   * "pending"` dentro da MESMA transação que faz a escrita (impossível
   * debitar duas vezes o mesmo CashoutRequest).
   */
  static async completeWireCashout(
    cashoutId: Types.ObjectId,
    adminId: Types.ObjectId,
    execution: {
      executedForeignAmount: number;
      executedNetAmount: number;
      swiftReference?: string;
      uetr?: string;
      adminNote?: string;
    },
    checks: {
      beneficiaryVerified: boolean;
      bankDetailsVerified: boolean;
      documentationVerified: boolean;
      sanctionsChecked: boolean;
      kycVerified: boolean;
    }
  ): Promise<ICashoutRequest> {
    if (!execution.executedForeignAmount || execution.executedForeignAmount <= 0) {
      throw new Error("Valor executado (moeda estrangeira) inválido.");
    }
    if (!execution.executedNetAmount || execution.executedNetAmount <= 0) {
      throw new Error("Custo real em BRL inválido.");
    }
    const missingChecks = Object.entries(checks)
      .filter(([, checked]) => !checked)
      .map(([key]) => key);
    if (missingChecks.length > 0) {
      throw new Error(`Confirme todos os itens de compliance antes de concluir: ${missingChecks.join(", ")}.`);
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const cashout = await CashoutRequest.findById(cashoutId).session(session);
      if (!cashout || cashout.rail !== "wire") {
        throw new Error("Pedido de wire não encontrado.");
      }
      // 🔒 Guarda de idempotência — dentro da transação, antes de qualquer
      // escrita. Uma segunda chamada (double-click, retry) cai aqui e nunca
      // debita de novo.
      if (cashout.status !== "pending") {
        throw new Error(`Esse wire já foi processado (status atual: "${cashout.status}").`);
      }

      const fee = round2(cashout.fee ?? 0);
      const executedNetAmount = round2(execution.executedNetAmount);
      const executedAmount = round2(executedNetAmount + fee);
      const maxBrlAmount = round2(cashout.maxBrlAmount ?? cashout.amount);

      if (executedAmount > maxBrlAmount) {
        throw new Error(
          `Valor executado (R$${executedAmount.toFixed(2)}) passa do teto reservado no pedido (R$${maxBrlAmount.toFixed(2)}) — o câmbio deve ter mudado contra. Rejeite este pedido (devolve o saldo integral) e peça um novo, com a cotação atual.`
        );
      }

      const wallet = await Wallet.findOne({ userId: cashout.userId }).session(session);
      if (!wallet) throw new Error("Carteira não encontrada.");

      // Devolve só a SOBRA do teto congelado — o valor real (executedAmount)
      // permanece debitado.
      const refund = round2(maxBrlAmount - executedAmount);
      if (refund > 0) {
        wallet.balance.available = round2(wallet.balance.available + refund);
        wallet.log.push({
          transactionId: cashout._id as Types.ObjectId,
          type: "topup",
          method: "pix",
          amount: refund,
          security: { createdAt: new Date(), ipAddress: "system", userAgent: "wire-cashout-refund-diff" },
        });
      }
      wallet.log.push({
        transactionId: cashout._id as Types.ObjectId,
        type: "withdraw",
        method: "pix",
        amount: executedAmount,
        security: { createdAt: new Date(), ipAddress: "system", userAgent: "wire-cashout-execution", approvedBy: adminId },
      });
      await wallet.save({ session });

      await postLedgerEntries(
        [
          { account: "passivo_seller", type: "debit", amount: executedAmount },
          { account: "conta_liquidacao", type: "credit", amount: executedNetAmount },
          ...(fee > 0 ? [{ account: "receita_taxa_kissa", type: "credit" as const, amount: fee }] : []),
        ],
        {
          idempotencyKey: `wire:${cashoutId.toString()}`,
          transactionId: cashoutId.toString(),
          sellerId: cashout.userId.toString(),
          source: { system: "cashout", acquirer: "sttart" },
          eventAt: new Date(),
        },
        session
      );

      const now = new Date();
      const complianceEntry = { checkedBy: adminId, checkedAt: now };
      const wireCompliance: IWireCompliance = {
        beneficiaryVerified: complianceEntry,
        bankDetailsVerified: complianceEntry,
        documentationVerified: complianceEntry,
        sanctionsChecked: complianceEntry,
        kycVerified: complianceEntry,
      };

      cashout.amount = executedAmount;
      cashout.netAmount = executedNetAmount;
      cashout.status = "completed";
      cashout.approvedBy = adminId;
      cashout.approvedAt = now;
      cashout.wireCompliance = wireCompliance;
      cashout.wireExecution = {
        executedAt: now,
        executedBy: adminId,
        executedForeignAmount: execution.executedForeignAmount,
        executedNetAmount,
        swiftReference: execution.swiftReference,
        uetr: execution.uetr,
        adminNote: execution.adminNote,
        // Deliberadamente inequívoco — nunca "recebido"/"confirmado" no
        // sentido de confirmado pelo beneficiário (ver comentário da classe).
        providerStatus: `Wire enviado manualmente via painel da Sttart em ${now.toLocaleString("pt-BR")} — não confirma recebimento pelo beneficiário.`,
      };
      cashout.providerStatus = cashout.wireExecution.providerStatus;
      await cashout.save({ session });

      await session.commitTransaction();

      await TransactionAuditService.log({
        transactionId: cashout._id as Types.ObjectId,
        sellerId: cashout.userId as Types.ObjectId,
        userId: cashout.userId as Types.ObjectId,
        amount: executedAmount,
        method: "pix",
        status: "approved",
        kycStatus: "verified",
        flags: [],
        description: `Wire internacional registrado como enviado manualmente por admin ${adminId.toString()} (ref. SWIFT/UETR: ${execution.swiftReference || execution.uetr || "não informada"}).`,
      });

      return cashout;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  /**
   * Rejeita um pedido de wire ainda pendente — devolve o TETO congelado
   * inteiro pro saldo (nada foi executado de verdade). Mesma guarda de
   * idempotência de completeWireCashout.
   */
  static async rejectWireCashout(
    cashoutId: Types.ObjectId,
    adminId: Types.ObjectId,
    reason: string
  ): Promise<ICashoutRequest> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const cashout = await CashoutRequest.findById(cashoutId).session(session);
      if (!cashout || cashout.rail !== "wire") {
        throw new Error("Pedido de wire não encontrado.");
      }
      if (cashout.status !== "pending") {
        throw new Error(`Esse wire já foi processado (status atual: "${cashout.status}").`);
      }

      const wallet = await Wallet.findOne({ userId: cashout.userId }).session(session);
      if (!wallet) throw new Error("Carteira não encontrada.");

      const maxBrlAmount = round2(cashout.maxBrlAmount ?? cashout.amount);
      wallet.balance.available = round2(wallet.balance.available + maxBrlAmount);
      wallet.log.push({
        transactionId: cashout._id as Types.ObjectId,
        type: "topup",
        method: "pix",
        amount: maxBrlAmount,
        security: { createdAt: new Date(), ipAddress: "system", userAgent: "wire-cashout-reject" },
      });
      await wallet.save({ session });

      cashout.status = "rejected";
      cashout.approvedBy = adminId;
      cashout.rejectionReason = reason;
      await cashout.save({ session });

      await session.commitTransaction();

      await TransactionAuditService.log({
        transactionId: cashout._id as Types.ObjectId,
        sellerId: cashout.userId as Types.ObjectId,
        userId: cashout.userId as Types.ObjectId,
        amount: maxBrlAmount,
        method: "pix",
        status: "failed",
        kycStatus: "verified",
        flags: ["FAILED_ATTEMPT"],
        description: `Pedido de wire rejeitado: ${reason}`,
      });

      return cashout;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }
}
