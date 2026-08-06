import { ClientSession, Types } from "mongoose";
import { Seller } from "../models/seller.model";
import { Wallet } from "../models/wallet.model";
import { Transaction } from "../models/transaction.model";
import { AnticipationRequest, AnticipationTier } from "../models/anticipationRequest.model";
import { getOrCreateDefaultFeeConfig } from "../models/systemFeeConfig.model";
import { postLedgerEntries } from "./ledger/ledger.service";
import { round } from "../utils/fees";

/**
 * 💸 Serviço de Antecipação — segue o mesmo padrão de CashoutService
 * (services/cashout.service.ts): mutação atômica de wallet + lançamento
 * contábil de dupla-entrada. Diferente do saque, roda na hora, sem
 * aprovação do master — é o próprio dinheiro do seller, ele só troca
 * "esperar mais" por "receber antes pagando uma taxa".
 */
export class AnticipationService {
  static async anticipate(
    userId: Types.ObjectId,
    unAvailableEntryId: string,
    tier: AnticipationTier,
    session: ClientSession
  ) {
    const seller = await Seller.findOne({ userId });
    if (!seller) throw new Error("Seller não encontrado.");

    const defaultConfig = await getOrCreateDefaultFeeConfig();
    const feeTable = seller.feeTable ?? defaultConfig.feeTable;

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    const entry = (wallet.balance.unAvailable as any).id(unAvailableEntryId);
    if (!entry) throw new Error("Reserva não encontrada.");

    if (entry.availableIn.getTime() <= Date.now()) {
      throw new Error("Esse valor já está disponível — não precisa antecipar.");
    }

    // 🚫 Antecipação é só pra cartão — Pix já cai D0, boleto e retenções
    // manuais (saque, simulação) não são elegíveis. Resolve pela transação de
    // origem em vez de confiar só em entry.method pra cobrir reservas antigas
    // criadas antes desse campo existir.
    let originMethod = entry.method as string | undefined;
    if (!originMethod && entry.originTransactionId) {
      const originTx = await Transaction.findById(entry.originTransactionId).select("method").lean();
      originMethod = originTx?.method === "credit_card" ? "card" : originTx?.method;
    }
    if (originMethod !== "card") {
      throw new Error("Só é possível antecipar valores recebidos por cartão.");
    }

    const extraPercentage =
      tier === "day15"
        ? feeTable.anticipation.day15.extraPercentage
        : feeTable.anticipation.day2.extraPercentage;

    const originalAmount = entry.amount;
    const extraFeeAmount = round(originalAmount * (extraPercentage / 100));
    const payoutAmount = round(originalAmount - extraFeeAmount);
    const originalAvailableIn = entry.availableIn;

    // ❄️ Move da reserva pro saldo disponível, já descontada a taxa de antecipação.
    (wallet.balance.unAvailable as any).pull(unAvailableEntryId);
    wallet.balance.available = round(wallet.balance.available + payoutAmount);

    wallet.log.push({
      transactionId: entry.originTransactionId || new Types.ObjectId(),
      type: "topup",
      method: "manual",
      amount: payoutAmount,
      security: {
        createdAt: new Date(),
        ipAddress: "system",
        userAgent: "anticipation-service",
      },
    });

    await wallet.save({ session });

    const [request] = await AnticipationRequest.create(
      [
        {
          userId,
          sellerId: seller._id,
          originalAmount,
          tier,
          extraFeePercentage: extraPercentage,
          extraFeeAmount,
          payoutAmount,
          originalAvailableIn,
        },
      ],
      { session }
    );

    // 🧾 Ledger — reduz o passivo com o seller no valor da taxa retida (a
    // plataforma fica com extraFeeAmount, o seller recebe o resto na hora).
    // Roda na mesma sessão do controller — atômico com a wallet/request acima.
    await postLedgerEntries(
      [
        { account: "passivo_seller", type: "debit", amount: extraFeeAmount },
        { account: "receita_taxa_antecipacao", type: "credit", amount: extraFeeAmount },
      ],
      {
        idempotencyKey: `anticipation:${(request._id as Types.ObjectId).toString()}`,
        transactionId: (request._id as Types.ObjectId).toString(),
        sellerId: (seller._id as Types.ObjectId).toString(),
        source: { system: "anticipation" },
        eventAt: new Date(),
      },
      session
    );

    return { request, wallet, payoutAmount, extraFeeAmount };
  }
}
