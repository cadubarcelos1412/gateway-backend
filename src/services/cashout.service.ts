import mongoose, { ClientSession, Types } from "mongoose";
import { Wallet } from "../models/wallet.model";
import CashoutRequest from "../models/cashoutRequest.model";
import { Seller } from "../models/seller.model";
import { TransactionAuditService } from "./transactionAudit.service";
import { postLedgerEntries } from "./ledger/ledger.service";
import { round2 } from "./ledger/helpers";
import { getUsdtQuote, sendUsdtPayment } from "../lib/zendry/crypto";
import { sendPixPayment, ZendryPixKeyType } from "../lib/zendry/pixPayout";
import { DEFAULT_FEE_TABLE } from "../models/feeTable.types";
import { releaseMaturedBalance } from "./wallet.service";
import { ICashoutRequest } from "../models/cashoutRequest.model";

/**
 * 💸 Serviço de Cashout (Liquidação)
 * - Controla todo fluxo de saque, aprovação e rejeição
 * - Gera lançamentos contábeis (dupla-entrada) e auditoria
 */
export class CashoutService {
  /**
   * 1️⃣ Criar solicitação de saque
   */
  static async createCashout(
    userId: Types.ObjectId,
    amount: number,
    session?: ClientSession,
    pixKeyInfo?: { type: "cpf" | "cnpj" | "email" | "phone" | "random"; key: string; holderName?: string; holderDocument?: string }
  ) {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    // Libera reservas já maduras antes de checar saldo — sem isso, dinheiro
    // que já devia estar disponível (ex.: Pix D+0) aparece preso e o seller
    // não consegue sacar mesmo já tendo passado do prazo.
    await releaseMaturedBalance(wallet, session);

    if (wallet.balance.available < amount) throw new Error("Saldo insuficiente para saque.");

    // ❄️ Congela o valor solicitado — só isso já impede o seller de gastar
    // ou sacar de novo o mesmo dinheiro enquanto a solicitação está em
    // aberto. NÃO empurra pra wallet.balance.unAvailable (bug corrigido em
    // 2026-08-10): esse array é pra dinheiro de VENDA ainda em retenção,
    // que uma varredura periódica libera sozinha quando o prazo vence (ver
    // wallet.service.ts). Empurrar a trava do SAQUE ali, com um timer de 3
    // dias arbitrário, fazia esse mesmo valor ser creditado de volta
    // automaticamente 3 dias depois — mesmo já aprovado (dinheiro
    // realmente enviado) ou já rejeitado (rejectCashout já devolve pra
    // available na hora, então essa segunda entrada duplicava o crédito).
    // approveCashout deixa o valor debitado (correto, já saiu de verdade);
    // rejectCashout já devolve pra available diretamente — nenhum dos dois
    // precisa de ajuda de uma reserva aqui.
    wallet.balance.available -= amount;

    const [cashout] = await CashoutRequest.create(
      [
        {
          userId,
          amount,
          status: "pending",
          pixKeyType: pixKeyInfo?.type,
          pixKey: pixKeyInfo?.key,
          pixKeyHolderName: pixKeyInfo?.holderName,
          pixKeyHolderDocument: pixKeyInfo?.holderDocument,
        },
      ],
      { session }
    );

    await wallet.save({ session });

    await TransactionAuditService.log({
      transactionId: null,
      sellerId: userId,
      userId,
      amount,
      method: "pix",
      status: "pending",
      kycStatus: "verified",
      flags: [],
      description: "Solicitação de saque criada.",
    });

    return cashout;
  }

  /**
   * 2️⃣ Aprovar solicitação de saque
   */
  static async approveCashout(
    cashoutId: Types.ObjectId,
    adminId: Types.ObjectId,
    session: ClientSession
  ) {
    const cashout = await CashoutRequest.findById(cashoutId);
    if (!cashout) throw new Error("Solicitação não encontrada.");
    if (cashout.status !== "pending") throw new Error("Solicitação já processada.");

    const wallet = await Wallet.findOne({ userId: cashout.userId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    const amount = round2(cashout.amount);

    // 🧾 Lançamentos contábeis — duplo-entry
    await postLedgerEntries(
      [
        { account: "passivo_seller", type: "debit", amount },
        { account: "conta_corrente_bancaria", type: "credit", amount },
      ],
      {
        idempotencyKey: `cashout:${(cashout._id as Types.ObjectId).toString()}`,
        transactionId: (cashout._id as Types.ObjectId).toString(),
        sellerId: cashout.userId.toString(),
        source: { system: "cashout", acquirer: "admin" },
        eventAt: new Date(),
      },
      session
    );

    wallet.log.push({
      transactionId: new mongoose.Types.ObjectId(),
      type: "withdraw",
      method: "pix",
      amount,
      security: {
        createdAt: new Date(),
        ipAddress: "system",
        userAgent: "admin-dashboard",
      },
    });

    await wallet.save({ session });

    cashout.status = "approved";
    cashout.approvedBy = adminId;
    cashout.approvedAt = new Date();
    await cashout.save({ session });

    await TransactionAuditService.log({
      transactionId: cashout._id as Types.ObjectId,
      sellerId: cashout.userId as Types.ObjectId,
      userId: cashout.userId as Types.ObjectId,
      amount,
      method: "pix",
      status: "approved",
      kycStatus: "verified",
      flags: [],
      description: "Saque aprovado e liquidado no ledger.",
    });

    return { cashout, wallet };
  }

  /**
   * 2️⃣b Envia o PIX de verdade pela Zendry pra um saque JÁ aprovado
   * internamente (ledger/wallet já debitados por approveCashout, dentro da
   * transação que o caller já commitou). Chamar isso SÓ depois do commit —
   * mesma razão de atomicidade do saque em USDT (ver createCryptoCashout):
   * é uma chamada HTTP externa e irreversível, não pode ficar no meio de
   * uma transação Mongo que ainda pode abortar.
   *
   * Se a Zendry falhar aqui, o saldo do seller já foi debitado e o saque já
   * está "approved" no nosso sistema — não propaga erro pro caller (a
   * aprovação em si funcionou), mas NUNCA falha em silêncio: grava a falha
   * em cashout.providerStatus (visível no painel master, ver
   * WithdrawalPage.tsx) além de logar como crítico. Achado em produção em
   * 2026-08-10: os 2 primeiros saques reais falharam aqui e ninguém viu —
   * só log de servidor que ninguém olha.
   */
  static async sendApprovedPixPayout(cashout: ICashoutRequest): Promise<void> {
    if (cashout.rail !== "pix") return;
    if (!cashout.pixKey || !cashout.pixKeyType) {
      cashout.providerStatus = "FALHOU: chave PIX ausente no registro do saque.";
      await cashout.save();
      console.error(`❌ CRÍTICO: saque ${(cashout._id as Types.ObjectId).toString()} aprovado sem chave PIX registrada — não dá pra enviar automaticamente, precisa de intervenção manual.`);
      return;
    }

    const zendryKeyTypeMap: Record<string, ZendryPixKeyType> = {
      cpf: "cpf",
      cnpj: "cnpj",
      email: "email",
      phone: "phone",
      random: "token",
    };

    try {
      const result = await sendPixPayment({
        idempotentId: (cashout._id as Types.ObjectId).toString(),
        pixKeyType: zendryKeyTypeMap[cashout.pixKeyType],
        pixKey: cashout.pixKey,
        receiverName: cashout.pixKeyHolderName,
        receiverDocument: cashout.pixKeyHolderDocument,
        valueCents: Math.round(cashout.amount * 100),
      });
      cashout.externalReference = result.referenceCode;
      cashout.providerStatus = result.status;
      await cashout.save();
    } catch (err) {
      // Visível pra quem for olhar o saque no painel master, não só no log
      // do servidor — truncado porque o erro cru pode conter detalhe da
      // resposta da Zendry que não deveria virar texto solto na tela.
      cashout.providerStatus = `FALHOU: ${(err as Error).message?.slice(0, 200) || "erro desconhecido"}`;
      await cashout.save();
      console.error(
        `❌ CRÍTICO: saque ${(cashout._id as Types.ObjectId).toString()} aprovado (saldo já debitado) mas o envio real do PIX pela Zendry falhou — precisa reconciliação manual:`,
        err
      );
    }
  }

  /**
   * 3️⃣ Rejeitar solicitação de saque
   */
  static async rejectCashout(
    cashoutId: Types.ObjectId,
    adminId: Types.ObjectId,
    reason: string,
    session?: ClientSession
  ) {
    const cashout = await CashoutRequest.findById(cashoutId);
    if (!cashout) throw new Error("Solicitação não encontrada.");
    if (cashout.status !== "pending") throw new Error("Solicitação já processada.");

    const wallet = await Wallet.findOne({ userId: cashout.userId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    wallet.balance.available += cashout.amount;

    wallet.log.push({
      transactionId: new mongoose.Types.ObjectId(),
      type: "topup",
      method: "pix",
      amount: cashout.amount,
      security: {
        createdAt: new Date(),
        ipAddress: "system",
        userAgent: "admin-dashboard",
      },
    });

    await wallet.save({ session });

    // ✅ trocado de "failed" para "rejected" — valor suportado por CashoutStatus
    cashout.status = "rejected";
    cashout.approvedBy = adminId;
    cashout.rejectionReason = reason;
    await cashout.save({ session });

    await TransactionAuditService.log({
      transactionId: cashout._id as Types.ObjectId,
      sellerId: cashout.userId as Types.ObjectId,
      userId: cashout.userId as Types.ObjectId,
      amount: cashout.amount,
      method: "pix",
      status: "failed",
      kycStatus: "verified",
      flags: ["FAILED_ATTEMPT"],
      description: `Saque rejeitado: ${reason}`,
    });

    return { cashout, wallet };
  }

  /**
   * 4️⃣ Saque em USDT via Zendry — diferente do saque Pix (manual, admin
   * aprova depois), esse dispara a chamada real à Zendry NA HORA. Exige KYC
   * aprovado e respeita um teto de valor por saque
   * (ZENDRY_MAX_USDT_CASHOUT_BRL).
   *
   * IMPORTANTE sobre atomicidade — isso é DIFERENTE do resto do
   * cashout.service.ts de propósito: `sendUsdtPayment` é uma chamada HTTP
   * externa e IRREVERSÍVEL (dinheiro sai de verdade), não uma escrita no
   * nosso banco. Se ela ficasse no meio de uma única transação Mongo (como
   * o resto do arquivo faz, corretamente, só com escritas locais), um erro
   * QUALQUER depois do envio (ex.: falha ao salvar a wallet) faria a
   * transação abortar e apagaria até o REGISTRO do saque — sobrando USDT
   * enviado de verdade sem nenhum rastro no banco. Por isso aqui:
   *   1) grava o CashoutRequest ANTES de mandar o USDT (sessão própria,
   *      commit imediato — existe um registro mesmo que tudo dê errado
   *      depois);
   *   2) manda o USDT;
   *   3) só DEPOIS do envio confirmado, tenta debitar wallet + lançar
   *      ledger numa segunda transação — se essa segunda parte falhar, o
   *      dinheiro já foi enviado e o CashoutRequest já teve seu
   *      externalReference gravado, então dá pra reconciliar manualmente
   *      (não é um caso "saque falhou, sem efeito", é "saque funcionou,
   *      contabilidade ficou pendente de acerto").
   *
   * Lacunas conhecidas (ver ZENDRY-MIGRATION.md / plano): não existe
   * confirmação/webhook documentado pro pagamento cripto — `status` fica
   * em "approved" (enviado), nunca "completed", até isso ser esclarecido
   * com o suporte da Zendry.
   */
  static async createCryptoCashout(
    userId: Types.ObjectId,
    amountBRL: number,
    destinationAddress: string
  ) {
    if (!amountBRL || amountBRL <= 0) throw new Error("Valor de saque inválido.");

    const maxAmount = Number(process.env.ZENDRY_MAX_USDT_CASHOUT_BRL || 500);
    if (amountBRL > maxAmount) {
      throw new Error(`Valor acima do limite por saque em USDT (R$ ${maxAmount.toFixed(2)}).`);
    }

    if (!destinationAddress || destinationAddress.trim().length < 10) {
      throw new Error("Endereço de destino inválido.");
    }

    const treasuryWalletId = process.env.ZENDRY_TREASURY_WALLET_ID;
    if (!treasuryWalletId) {
      throw new Error("Saque em USDT indisponível no momento (wallet-tesouro não configurada).");
    }

    const seller = await Seller.findOne({ userId });
    if (!seller) throw new Error("Seller não encontrado.");
    if (seller.kycStatus !== "approved" && seller.kycStatus !== "active") {
      throw new Error("Saque em USDT exige verificação de identidade aprovada.");
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) throw new Error("Carteira não encontrada.");
    await releaseMaturedBalance(wallet);
    if (wallet.balance.available < amountBRL) throw new Error("Saldo insuficiente para saque.");

    const usdtOut = seller.feeTable?.usdtOut ?? DEFAULT_FEE_TABLE.usdtOut;
    const fee = round2(usdtOut.fixed + (amountBRL * usdtOut.percentage) / 100);
    const netAmountBRL = round2(amountBRL - fee);
    if (netAmountBRL <= 0) throw new Error("Valor líquido do saque inválido após taxas.");

    const { brlPrice } = await getUsdtQuote();
    if (!brlPrice || brlPrice <= 0) throw new Error("Cotação USDT indisponível no momento.");
    const usdtAmount = Math.round((netAmountBRL / brlPrice) * 100) / 100;

    // 1️⃣ Registro ANTES do envio — sem sessão, commit imediato.
    const cashout = await CashoutRequest.create({
      userId,
      amount: amountBRL,
      status: "pending",
      rail: "usdt",
      destinationAddress,
      quotedBrlPrice: brlPrice,
      usdtAmount,
      fee,
      netAmount: netAmountBRL,
    });

    // 2️⃣ Envio real — irreversível a partir daqui se der certo.
    let result;
    try {
      result = await sendUsdtPayment({
        senderWalletId: treasuryWalletId,
        receiverAddress: destinationAddress,
        valueUsdt: usdtAmount,
      });
    } catch (err) {
      // Nunca propaga a resposta bruta da Zendry pra cima (mesma disciplina
      // do ZendryAcquirer) — detalhe completo só no log do servidor.
      console.error("❌ Zendry (saque USDT) falhou:", err);
      cashout.status = "rejected";
      cashout.rejectionReason = "Erro ao enviar USDT — tente novamente ou contate o suporte.";
      await cashout.save();
      throw new Error("Erro ao enviar USDT — tente novamente ou contate o suporte.");
    }

    // "approved" = enviado à Zendry com sucesso. Não existe confirmação
    // assíncrona documentada pra virar "completed" — ver comentário da classe.
    cashout.status = "approved";
    cashout.externalReference = result.referenceCode;
    cashout.providerStatus = result.status;
    await cashout.save();

    // 3️⃣ Debita wallet + lança ledger — numa transação própria, DEPOIS do
    // envio já confirmado. Se isso falhar, o dinheiro já saiu e o registro
    // do saque (com externalReference) já existe pra reconciliação manual.
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      wallet.balance.available = round2(wallet.balance.available - amountBRL);
      wallet.log.push({
        transactionId: cashout._id as Types.ObjectId,
        type: "withdraw",
        method: "crypto",
        amount: amountBRL,
        security: {
          createdAt: new Date(),
          ipAddress: "system",
          userAgent: "crypto-cashout",
        },
      });
      await wallet.save({ session });

      await postLedgerEntries(
        [
          { account: "passivo_seller", type: "debit", amount: netAmountBRL },
          { account: "tesouraria_usdt", type: "credit", amount: netAmountBRL },
          { account: "passivo_seller", type: "debit", amount: fee },
          { account: "receita_taxa_kissa", type: "credit", amount: fee },
        ],
        {
          idempotencyKey: `crypto_cashout:${(cashout._id as Types.ObjectId).toString()}`,
          transactionId: (cashout._id as Types.ObjectId).toString(),
          sellerId: (seller._id as Types.ObjectId).toString(),
          source: { system: "cashout", acquirer: "zendry" },
          eventAt: new Date(),
        },
        session
      );

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      // CRÍTICO, mas não é um erro pro seller — o USDT já foi enviado de
      // verdade. Fica registrado pra reconciliação manual (o CashoutRequest
      // já tem status "approved" + externalReference salvos acima).
      console.error(
        `❌ CRÍTICO: USDT enviado (reference_code: ${result.referenceCode}, cashout: ${(cashout._id as Types.ObjectId).toString()}) mas falhou ao debitar wallet/lançar ledger:`,
        err
      );
    } finally {
      session.endSession();
    }

    await TransactionAuditService.log({
      transactionId: cashout._id as Types.ObjectId,
      sellerId: seller._id as Types.ObjectId,
      userId,
      amount: amountBRL,
      // AuditData.method só aceita pix/credit_card/boleto hoje — mesma
      // limitação que o resto do cashout.service.ts já tem (approveCashout/
      // rejectCashout também gravam "pix" independente do trilho real).
      method: "pix",
      status: "approved",
      kycStatus: seller.kycStatus,
      flags: [],
      description: `Saque em USDT enviado via Zendry (reference_code: ${result.referenceCode}).`,
    });

    return { cashout, wallet, usdtAmount };
  }
}
