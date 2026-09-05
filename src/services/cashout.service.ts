import mongoose, { ClientSession, Types } from "mongoose";
import { Wallet } from "../models/wallet.model";
import CashoutRequest from "../models/cashoutRequest.model";
import { Seller } from "../models/seller.model";
import { TransactionAuditService } from "./transactionAudit.service";
import { postLedgerEntries } from "./ledger/ledger.service";
import { round2 } from "./ledger/helpers";
import { resolveAcquirer, resolveSellerAcquirer, AcquirerKey } from "../acquirers";
import { PixKeyType } from "../acquirers/types";
import { DEFAULT_FEE_TABLE } from "../models/feeTable.types";
import { releaseMaturedBalance } from "./wallet.service";
import { ICashoutRequest } from "../models/cashoutRequest.model";
import { dispatchWebhookEvent } from "./webhook.service";

function toPublicWithdraw(cashout: { _id: unknown; amount: number; fee?: number; netAmount?: number; status: string }) {
  return {
    id: String(cashout._id),
    object: "withdraw",
    amount: Math.round(cashout.amount * 100),
    fee: cashout.fee ? Math.round(cashout.fee * 100) : undefined,
    net_amount: cashout.netAmount ? Math.round(cashout.netAmount * 100) : undefined,
    currency: "BRL",
    status: cashout.status,
  };
}

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
    desiredAmount: number,
    session?: ClientSession,
    pixKeyInfo?: { type: "cpf" | "cnpj" | "email" | "phone" | "random"; key: string; holderName?: string; holderDocument?: string }
  ) {
    // 🔒 Achado CRÍTICO em auditoria de segurança (2026-08-30): esta leitura
    // rodava SEM `.session(session)` mesmo quando o chamador já tinha aberto
    // uma transação — o snapshot de isolamento do Mongo só vale pra leituras
    // feitas DENTRO da sessão. Sem isso, duas requisições de saque
    // concorrentes liam o mesmo saldo "disponível" antes de qualquer uma
    // escrever, as duas passavam na checagem de saldo, e as duas debitavam a
    // partir do mesmo valor — permitindo sacar mais do que o saldo real
    // (com saque automático ligado, o Pix saía de verdade em dobro). Agora,
    // dentro de uma transação real, a segunda escrita concorrente falha com
    // WriteConflict do próprio MongoDB em vez de silenciosamente duplicar.
    const wallet = await Wallet.findOne({ userId }).session(session ?? null);
    if (!wallet) throw new Error("Carteira não encontrada.");

    // Libera reservas já maduras antes de checar saldo — sem isso, dinheiro
    // que já devia estar disponível (ex.: Pix D+0) aparece preso e o seller
    // não consegue sacar mesmo já tendo passado do prazo.
    await releaseMaturedBalance(wallet, session);

    // 💸 Taxa de Pix OUT — decisão do produto em 2026-08-12: a taxa soma
    // EM CIMA do valor que o seller pede (ele diz quanto quer RECEBER, não
    // quanto quer ver debitado). Antes disso a taxa saía do próprio valor
    // pedido — mudou porque, na cabeça do seller, pedir R$3.900 tendo
    // R$3.900 de saldo tinha que ser sempre possível; com a taxa saindo de
    // cima, quem "sobra" pra cobrir a taxa é o próprio saldo, não o valor
    // pedido, então o máximo que dá pra pedir fica abaixo do saldo total.
    const seller = await Seller.findOne({ userId });
    const pixOut = seller?.feeTable?.pixOut ?? DEFAULT_FEE_TABLE.pixOut;
    const fee = round2(pixOut.fixed + (desiredAmount * pixOut.percentage) / 100);
    // amount = total que sai do saldo (o que o seller recebe + a taxa) —
    // netAmount = exatamente o que foi pedido/será entregue. Mantém o
    // mesmo invariante amount = netAmount + fee que approveCashout,
    // sendApprovedPixPayout, refundFailedPixPayout e rejectCashout já
    // assumem, então nenhum deles precisou mudar.
    const amount = round2(desiredAmount + fee);

    if (wallet.balance.available < amount) {
      throw new Error(
        `Saldo insuficiente pra cobrir esse saque mais a taxa. Com a taxa de Pix out, o máximo que dá pra pedir agora é R$${round2((wallet.balance.available - pixOut.fixed) / (1 + pixOut.percentage / 100)).toFixed(2).replace(".", ",")}.`
      );
    }

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
          fee,
          netAmount: round2(desiredAmount),
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
    // 🔒 Mesma correção de createCashout — leitura dentro da transação, pra
    // que duas aprovações concorrentes do mesmo saque não passem ambas pela
    // checagem "ainda pendente?" antes de qualquer uma escrever.
    const cashout = await CashoutRequest.findById(cashoutId).session(session);
    if (!cashout) throw new Error("Solicitação não encontrada.");
    if (cashout.status !== "pending") throw new Error("Solicitação já processada.");

    const wallet = await Wallet.findOne({ userId: cashout.userId }).session(session);
    if (!wallet) throw new Error("Carteira não encontrada.");

    const amount = round2(cashout.amount);
    // Fallback pra saques criados antes desse campo existir (fee/netAmount
    // nunca eram calculados) — trata como se não houvesse taxa, em vez de
    // quebrar o lançamento contábil de registros antigos.
    const fee = round2(cashout.fee ?? 0);
    const netAmount = round2(cashout.netAmount ?? amount);

    // 🧾 Lançamentos contábeis — duplo-entry. netAmount + fee = amount
    // sempre (ver createCashout), então os débitos e créditos batem.
    await postLedgerEntries(
      [
        { account: "passivo_seller", type: "debit", amount },
        { account: "conta_liquidacao", type: "credit", amount: netAmount },
        ...(fee > 0 ? [{ account: "receita_taxa_kissa", type: "credit" as const, amount: fee }] : []),
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
      await CashoutService.refundFailedPixPayout(cashout._id as Types.ObjectId, cashout.providerStatus);
      return;
    }

    // Roteamento por seller (ver Seller.acquirer / AcquirersPage.tsx) —
    // snapshot gravado ANTES do envio: se o master trocar a adquirente do
    // seller depois, a reconciliação DESTE saque específico continua
    // sabendo qual API consultar (ver pixPayoutReconciliation.service.ts).
    const seller = await Seller.findOne({ userId: cashout.userId });

    // 🏦 Adquirente por método (2026-08-30) — se o master desligou Pix pra
    // esse seller DEPOIS do pedido ser aprovado (janela rara, mas possível),
    // resolveSellerAcquirer lança em vez de mandar pra uma adquirente
    // errada — tratado igual a qualquer outra falha de envio: devolve o
    // saldo, nunca falha em silêncio.
    let acquirerKey: AcquirerKey;
    try {
      acquirerKey = seller ? (resolveSellerAcquirer(seller, "pix") as AcquirerKey) : "zendry";
    } catch (err) {
      cashout.providerStatus = `FALHOU: ${(err as Error).message}`;
      await cashout.save();
      console.error(`❌ CRÍTICO: saque ${(cashout._id as Types.ObjectId).toString()} aprovado, mas Pix está desligado pra esse seller agora.`);
      await CashoutService.refundFailedPixPayout(cashout._id as Types.ObjectId, cashout.providerStatus);
      return;
    }

    cashout.acquirer = acquirerKey;
    const acquirer = resolveAcquirer(acquirerKey);

    if (!acquirer.sendPayout) {
      cashout.providerStatus = `FALHOU: adquirente "${acquirerKey}" não implementa envio de saque Pix.`;
      await cashout.save();
      console.error(`❌ CRÍTICO: saque ${(cashout._id as Types.ObjectId).toString()} aprovado, mas a adquirente "${acquirerKey}" não tem sendPayout implementado.`);
      await CashoutService.refundFailedPixPayout(cashout._id as Types.ObjectId, cashout.providerStatus);
      return;
    }

    try {
      const result = await acquirer.sendPayout({
        idempotentId: (cashout._id as Types.ObjectId).toString(),
        pixKeyType: cashout.pixKeyType as PixKeyType,
        pixKey: cashout.pixKey,
        receiverName: cashout.pixKeyHolderName,
        receiverDocument: cashout.pixKeyHolderDocument,
        // Manda o valor LÍQUIDO (depois da taxa de Pix out) — mandar o valor
        // cheio aqui era exatamente o motivo do saldo interno ficar maior
        // que o saldo real na adquirente (nenhuma margem capturada no saque).
        valueCents: Math.round((cashout.netAmount ?? cashout.amount) * 100),
      });
      cashout.externalReference = result.externalReference;
      cashout.providerStatus = result.status;
      await cashout.save();
    } catch (err) {
      // Visível pra quem for olhar o saque no painel master, não só no log
      // do servidor — truncado porque o erro cru pode conter detalhe da
      // resposta da adquirente que não deveria virar texto solto na tela.
      cashout.providerStatus = `FALHOU: ${(err as Error).message?.slice(0, 200) || "erro desconhecido"}`;
      await cashout.save();
      console.error(
        `❌ CRÍTICO: saque ${(cashout._id as Types.ObjectId).toString()} aprovado (saldo já debitado) mas o envio real do PIX pela ${acquirerKey} falhou — precisa reconciliação manual:`,
        err
      );
      await CashoutService.refundFailedPixPayout(cashout._id as Types.ObjectId, cashout.providerStatus);
    }
  }

  /**
   * 4️⃣b Devolve o saldo de um saque Pix que falhou no envio ou que a
   * Zendry aceitou e depois CANCELOU (status final "canceled", ver
   * pixPayoutReconciliation.service.ts) — sem isso, o valor fica descontado
   * do vendedor pra sempre mesmo o Pix nunca tendo saído de verdade.
   *
   * Achado em produção em 2026-08-12: dois saques reais voltaram
   * "canceled"/"FALHOU" da Zendry e o saldo simplesmente sumiu da conta do
   * seller, sem devolução nenhuma — createCashout debita na hora do
   * pedido, e nada credicava de volta quando o envio não completava.
   *
   * Idempotente: só age se o cashout ainda estiver "approved" — a própria
   * devolução muda o status pra "rejected", então uma segunda chamada
   * (reconciliação rodando de novo, por exemplo) é no-op.
   */
  static async refundFailedPixPayout(cashoutId: Types.ObjectId, reason: string): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const cashout = await CashoutRequest.findById(cashoutId).session(session);
      if (!cashout || cashout.status !== "approved") {
        await session.abortTransaction();
        return;
      }

      const amount = round2(cashout.amount);
      const fee = round2(cashout.fee ?? 0);
      const netAmount = round2(cashout.netAmount ?? amount);

      // Decisão de negócio (2026-08-17): quando refundToUserId está setado,
      // o valor recuperado NÃO volta pro seller que causou o problema
      // (ex.: digitou a chave Pix errada) — vai pra outra conta. Só o
      // netAmount muda de mão (é o único valor que de fato voltou pro
      // nosso banco — a taxa já tinha virado receita em approveCashout e
      // continua sendo); o passivo do seller original não é restaurado de
      // propósito.
      if (cashout.refundToUserId) {
        const redirectWallet = await Wallet.findOne({ userId: cashout.refundToUserId }).session(session);
        if (!redirectWallet) throw new Error("Carteira de destino do redirecionamento não encontrada.");

        redirectWallet.balance.available = round2(redirectWallet.balance.available + netAmount);
        redirectWallet.log.push({
          transactionId: cashout._id as Types.ObjectId,
          type: "topup",
          method: "pix",
          amount: netAmount,
          security: { createdAt: new Date(), ipAddress: "system", userAgent: "pix-payout-refund-redirect" },
        });
        await redirectWallet.save({ session });

        await postLedgerEntries(
          [
            { account: "conta_liquidacao", type: "debit", amount: netAmount },
            { account: "passivo_seller", type: "credit", amount: netAmount, sellerId: cashout.refundToUserId.toString() },
          ],
          {
            idempotencyKey: `cashout_refund:${cashoutId.toString()}`,
            transactionId: cashoutId.toString(),
            sellerId: cashout.refundToUserId.toString(),
            source: { system: "cashout", acquirer: cashout.acquirer || "zendry" },
            eventAt: new Date(),
          },
          session
        );

        cashout.status = "rejected";
        cashout.rejectionReason = `Saque não completado pela adquirente (${reason}) — valor redirecionado por decisão administrativa, não devolvido ao seller original.`;
        await cashout.save({ session });

        await session.commitTransaction();

        await TransactionAuditService.log({
          transactionId: cashout._id as Types.ObjectId,
          sellerId: cashout.refundToUserId as Types.ObjectId,
          userId: cashout.refundToUserId as Types.ObjectId,
          amount: netAmount,
          method: "pix",
          status: "approved",
          kycStatus: "verified",
          flags: [],
          description: `Saque de ${cashout.userId.toString()} não completado pela adquirente — valor redirecionado por decisão administrativa (${reason}).`,
        });
        return;
      }

      const wallet = await Wallet.findOne({ userId: cashout.userId }).session(session);
      if (!wallet) throw new Error("Carteira não encontrada pra devolver saque falho.");

      wallet.balance.available = round2(wallet.balance.available + amount);
      wallet.log.push({
        transactionId: cashout._id as Types.ObjectId,
        type: "topup",
        method: "pix",
        amount,
        security: { createdAt: new Date(), ipAddress: "system", userAgent: "pix-payout-refund" },
      });
      await wallet.save({ session });

      // Reverte exatamente os lançamentos feitos em approveCashout —
      // netAmount + fee = amount sempre, então os débitos/créditos batem.
      await postLedgerEntries(
        [
          { account: "passivo_seller", type: "credit", amount },
          { account: "conta_liquidacao", type: "debit", amount: netAmount },
          ...(fee > 0 ? [{ account: "receita_taxa_kissa", type: "debit" as const, amount: fee }] : []),
        ],
        {
          idempotencyKey: `cashout_refund:${cashoutId.toString()}`,
          transactionId: cashoutId.toString(),
          sellerId: cashout.userId.toString(),
          source: { system: "cashout", acquirer: cashout.acquirer || "zendry" },
          eventAt: new Date(),
        },
        session
      );

      cashout.status = "rejected";
      cashout.rejectionReason = `Saldo devolvido automaticamente — ${reason}`;
      await cashout.save({ session });

      await session.commitTransaction();

      await TransactionAuditService.log({
        transactionId: cashout._id as Types.ObjectId,
        sellerId: cashout.userId as Types.ObjectId,
        userId: cashout.userId as Types.ObjectId,
        amount,
        method: "pix",
        status: "failed",
        kycStatus: "verified",
        flags: ["FAILED_ATTEMPT"],
        description: `Saque não completado pela adquirente — saldo devolvido automaticamente (${reason}).`,
      });
    } catch (err) {
      await session.abortTransaction();
      console.error(`❌ CRÍTICO: falha ao devolver saldo do saque ${cashoutId.toString()} que não completou:`, err);
    } finally {
      session.endSession();
    }
  }

  /**
   * 4️⃣c Cancela um saque "approved" travado SEM devolver o saldo — pro
   * caso em que o dinheiro precisa ser resolvido por fora (ex.: reenviar o
   * Pix direto no painel da Zendry pra chave certa, depois de um estorno).
   * Só fecha o registro como "rejected" pra sair da lista de pendências;
   * não mexe em wallet nem ledger, porque nenhum valor voltou pro nosso
   * lado — o dinheiro segue resolvido fora do app. Usar
   * refundFailedPixPayout em vez disso quando o valor deve simplesmente
   * voltar pro saldo do seller aqui dentro.
   */
  static async cancelWithoutRefund(
    cashoutId: Types.ObjectId,
    adminId: Types.ObjectId,
    reason: string
  ): Promise<void> {
    const cashout = await CashoutRequest.findById(cashoutId);
    if (!cashout || cashout.status !== "approved") {
      throw new Error(`Esse saque está com status "${cashout?.status ?? "inexistente"}", não "approved" — nada foi feito.`);
    }

    cashout.status = "rejected";
    cashout.approvedBy = adminId;
    cashout.rejectionReason = `Cancelado sem devolver saldo (resolvido por fora) — ${reason}`;
    await cashout.save();

    await TransactionAuditService.log({
      transactionId: cashout._id as Types.ObjectId,
      sellerId: cashout.userId as Types.ObjectId,
      userId: cashout.userId as Types.ObjectId,
      amount: cashout.amount,
      method: "pix",
      status: "failed",
      kycStatus: "verified",
      flags: [],
      description: `Saque cancelado manualmente sem devolver saldo — resolvido por fora: ${reason}`,
    });
  }

  /**
   * 2️⃣b Registra um saque que foi feito DIRETO no painel da Zendry (fora do
   * nosso app) — workaround usado enquanto a Zendry está instável e o envio
   * automático não é confiável. O dinheiro já saiu de verdade lá; isso aqui
   * só faz o saldo interno bater com o que realmente sobrou na Zendry,
   * debitando e lançando no ledger exatamente como um saque normal
   * aprovado, sem tentar mandar Pix nenhum (já foi enviado manualmente).
   *
   * `netAmount`/`fee` vêm digitados por quem está registrando (master),
   * lendo direto da tela da Zendry — não recalculamos com a taxa
   * configurada no sistema, porque o que importa aqui é bater com a
   * realidade, não com o que a gente esperava cobrar.
   */
  static async recordManualWithdrawal(
    userId: Types.ObjectId,
    netAmount: number,
    fee: number,
    adminId: Types.ObjectId,
    note?: string
  ) {
    if (netAmount <= 0) throw new Error("Valor recebido precisa ser maior que zero.");
    if (fee < 0) throw new Error("Taxa não pode ser negativa.");

    const amount = round2(netAmount + fee);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const wallet = await Wallet.findOne({ userId }).session(session);
      if (!wallet) throw new Error("Carteira não encontrada.");
      await releaseMaturedBalance(wallet, session);

      if (wallet.balance.available < amount) {
        throw new Error(
          `Saldo insuficiente — disponível: R$${wallet.balance.available.toFixed(2)}, tentando registrar R$${amount.toFixed(2)}.`
        );
      }

      wallet.balance.available = round2(wallet.balance.available - amount);
      wallet.log.push({
        transactionId: new mongoose.Types.ObjectId(),
        type: "withdraw",
        method: "pix",
        amount,
        security: {
          createdAt: new Date(),
          ipAddress: "system",
          userAgent: "manual-withdrawal-zendry",
          approvedBy: adminId,
        },
      });
      await wallet.save({ session });

      const [cashout] = await CashoutRequest.create(
        [
          {
            userId,
            amount,
            fee,
            netAmount: round2(netAmount),
            status: "completed",
            origin: "manual",
            rail: "pix",
            approvedBy: adminId,
            approvedAt: new Date(),
            providerStatus: `Registrado manualmente pelo master — saque feito direto no painel da Zendry.${note ? ` Nota: ${note}` : ""}`,
          },
        ],
        { session }
      );

      await postLedgerEntries(
        [
          { account: "passivo_seller", type: "debit", amount },
          { account: "conta_liquidacao", type: "credit", amount: netAmount },
          ...(fee > 0 ? [{ account: "receita_taxa_kissa", type: "credit" as const, amount: fee }] : []),
        ],
        {
          idempotencyKey: `cashout_manual:${(cashout._id as Types.ObjectId).toString()}`,
          transactionId: (cashout._id as Types.ObjectId).toString(),
          sellerId: userId.toString(),
          source: { system: "cashout", acquirer: "zendry" },
          eventAt: new Date(),
        },
        session
      );

      await session.commitTransaction();

      await TransactionAuditService.log({
        transactionId: cashout._id as Types.ObjectId,
        sellerId: userId,
        userId,
        amount,
        method: "pix",
        status: "approved",
        kycStatus: "verified",
        flags: [],
        description: `Saque manual registrado (feito direto na Zendry) por admin ${adminId.toString()}.`,
      });

      const seller = await Seller.findOne({ userId });
      if (seller) {
        void dispatchWebhookEvent(String(seller._id), "withdraw.completed", toPublicWithdraw(cashout));
      }

      return cashout;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
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
    // 🔒 Mesma correção de createCashout/approveCashout — leitura dentro da
    // transação.
    const cashout = await CashoutRequest.findById(cashoutId).session(session ?? null);
    if (!cashout) throw new Error("Solicitação não encontrada.");
    if (cashout.status !== "pending") throw new Error("Solicitação já processada.");

    const wallet = await Wallet.findOne({ userId: cashout.userId }).session(session ?? null);
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

    if (!destinationAddress || destinationAddress.trim().length < 10) {
      throw new Error("Endereço de destino inválido.");
    }

    const seller = await Seller.findOne({ userId });
    if (!seller) throw new Error("Seller não encontrado.");
    if (seller.kycStatus !== "approved" && seller.kycStatus !== "active") {
      throw new Error("Saque em USDT exige verificação de identidade aprovada.");
    }

    // Roteamento por seller — ver comentário equivalente em
    // sendApprovedPixPayout. Zendry usa wallet-tesouro pré-financiada,
    // Sttart cota+compra USDT de verdade a cada saque (ver
    // acquirers/sttart.acquirer.ts) — a diferença de modelo fica encapsulada
    // dentro de cada adapter, aqui só chamamos swapToStablecoin.
    // 🏦 Adquirente por método (2026-08-30) — capability "swap", separada
    // de Pix. resolveSellerAcquirer já lança um erro claro se o master
    // desligou USDT de propósito pra esse seller.
    const acquirerKey = resolveSellerAcquirer(seller, "swap") as AcquirerKey;
    const acquirer = resolveAcquirer(acquirerKey);
    if (!acquirer.swapToStablecoin) {
      throw new Error(`Saque em USDT indisponível — adquirente "${acquirerKey}" não implementa swap.`);
    }

    // Teto por saque — variável de ambiente própria por adquirente (cada
    // uma tem seu próprio risco/liquidez: Zendry usa wallet-tesouro
    // pré-financiada, Sttart compra USDT de verdade a cada saque).
    const maxAmountEnvVar = acquirerKey === "sttart" ? "STTART_MAX_USDT_CASHOUT_BRL" : "ZENDRY_MAX_USDT_CASHOUT_BRL";
    const maxAmount = Number(process.env[maxAmountEnvVar] || 500);
    if (amountBRL > maxAmount) {
      throw new Error(`Valor acima do limite por saque em USDT (R$ ${maxAmount.toFixed(2)}).`);
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) throw new Error("Carteira não encontrada.");
    await releaseMaturedBalance(wallet);
    if (wallet.balance.available < amountBRL) throw new Error("Saldo insuficiente para saque.");

    const usdtOut = seller.feeTable?.usdtOut ?? DEFAULT_FEE_TABLE.usdtOut;
    const fee = round2(usdtOut.fixed + (amountBRL * usdtOut.percentage) / 100);
    const netAmountBRL = round2(amountBRL - fee);
    if (netAmountBRL <= 0) throw new Error("Valor líquido do saque inválido após taxas.");

    // 1️⃣ Registro ANTES do envio — sem sessão, commit imediato.
    const cashout = await CashoutRequest.create({
      userId,
      amount: amountBRL,
      status: "pending",
      rail: "usdt",
      acquirer: acquirerKey,
      destinationAddress,
      fee,
      netAmount: netAmountBRL,
    });

    // 2️⃣ Envio real — irreversível a partir daqui se der certo.
    let result;
    try {
      result = await acquirer.swapToStablecoin({
        idempotentId: (cashout._id as Types.ObjectId).toString(),
        netAmountBRL,
        destinationAddress,
      });
    } catch (err) {
      // Nunca propaga a resposta bruta da adquirente pra cima (mesma
      // disciplina dos adapters) — detalhe completo só no log do servidor.
      console.error(`❌ ${acquirerKey} (saque USDT) falhou:`, err);
      cashout.status = "rejected";
      cashout.rejectionReason = "Erro ao enviar USDT — tente novamente ou contate o suporte.";
      await cashout.save();
      throw new Error("Erro ao enviar USDT — tente novamente ou contate o suporte.");
    }

    // "approved" = enviado à adquirente com sucesso. Não existe confirmação
    // assíncrona documentada pra virar "completed" — ver comentário da classe.
    cashout.status = "approved";
    cashout.externalReference = result.externalReference;
    cashout.providerStatus = result.status;
    cashout.quotedBrlPrice = result.quotedBrlPrice;
    cashout.usdtAmount = result.usdtAmount;
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
          source: { system: "cashout", acquirer: acquirerKey },
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
        `❌ CRÍTICO: USDT enviado (reference_code: ${result.externalReference}, cashout: ${(cashout._id as Types.ObjectId).toString()}) mas falhou ao debitar wallet/lançar ledger:`,
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
      description: `Saque em USDT enviado via ${acquirerKey} (reference_code: ${result.externalReference}).`,
    });

    return { cashout, wallet, usdtAmount: result.usdtAmount };
  }
}
