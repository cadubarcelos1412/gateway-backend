import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { decodeToken } from "../config/auth";
import { User, IUser } from "../models/user.model";
import { CashoutService } from "../services/cashout.service";
import CashoutRequest from "../models/cashoutRequest.model";
import { Seller } from "../models/seller.model";

/**
 * Confirma o PIN de saque antes de qualquer cashout (Pix ou USDT). Retorna
 * uma mensagem de erro em caso de falha, ou `null` se o PIN bateu.
 */
async function checkWithdrawalPin(user: IUser, providedPin: unknown): Promise<string | null> {
  if (!user.withdrawalPin?.hash) {
    return "Configure seu PIN de saque antes de continuar (Configurações > Segurança).";
  }
  if (!providedPin || typeof providedPin !== "string") {
    return "PIN de saque é obrigatório.";
  }
  const matches = await bcrypt.compare(providedPin, user.withdrawalPin.hash);
  return matches ? null : "PIN de saque incorreto.";
}

/* -------------------------------------------------------------------------- */
/* 💸 1️⃣ Seller cria solicitação de saque                                    */
/* -------------------------------------------------------------------------- */
export const createCashoutRequest = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload?.id) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { amount, pin, pixKeyType, pixKey, pixKeyHolderName, pixKeyHolderDocument } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ status: false, msg: "Valor de saque inválido." });
      return;
    }

    const validPixKeyTypes = ["cpf", "cnpj", "email", "phone", "random"];
    if (!pixKeyType || !validPixKeyTypes.includes(pixKeyType)) {
      res.status(400).json({ status: false, msg: "Tipo de chave PIX inválido." });
      return;
    }
    if (!pixKey || typeof pixKey !== "string" || !pixKey.trim()) {
      res.status(400).json({ status: false, msg: "Chave PIX é obrigatória." });
      return;
    }
    if (!pixKeyHolderName || typeof pixKeyHolderName !== "string" || !pixKeyHolderName.trim()) {
      res.status(400).json({ status: false, msg: "Nome do titular da chave PIX é obrigatório." });
      return;
    }
    // CPF/CNPJ do favorecido — a Zendry pede isso pra qualquer saque
    // (confirmado no painel deles em 2026-08-10), independente do tipo de
    // chave. Sem isso, os 2 primeiros saques reais falharam silenciosamente.
    const holderDocumentDigits = typeof pixKeyHolderDocument === "string" ? pixKeyHolderDocument.replace(/\D/g, "") : "";
    if (holderDocumentDigits.length !== 11 && holderDocumentDigits.length !== 14) {
      res.status(400).json({ status: false, msg: "CPF (11 dígitos) ou CNPJ (14 dígitos) do titular da chave é obrigatório." });
      return;
    }

    const user = await User.findById(payload.id);
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    const pinError = await checkWithdrawalPin(user, pin);
    if (pinError) {
      res.status(401).json({ status: false, msg: pinError });
      return;
    }

    let cashout = await CashoutService.createCashout(user._id as Types.ObjectId, amount, session, {
      type: pixKeyType,
      key: pixKey.trim(),
      holderName: pixKeyHolderName.trim(),
      holderDocument: holderDocumentDigits,
    });
    await session.commitTransaction();

    // 🤖 Seller com saque automático ligado (ver Seller.autoWithdrawEnabled,
    // painel master > Sellers Ativos > Ver Detalhes) — auto-aprova e já
    // dispara o envio real na Zendry, sem esperar ninguém. É uma segunda
    // transação própria (não dentro da de cima) pelo mesmo motivo do saque
    // em USDT: a chamada à Zendry é irreversível e não pode ficar no meio
    // de nada que ainda possa abortar.
    const seller = await Seller.findOne({ userId: user._id });
    let autoProcessed = false;
    if (seller?.autoWithdrawEnabled) {
      const autoSession = await mongoose.startSession();
      autoSession.startTransaction();
      try {
        const { cashout: approved } = await CashoutService.approveCashout(
          cashout._id as Types.ObjectId,
          user._id as Types.ObjectId, // "aprovado por" o próprio automatismo do seller
          autoSession
        );
        await autoSession.commitTransaction();
        cashout = approved;
        autoProcessed = true;
      } catch (err) {
        await autoSession.abortTransaction();
        console.error("❌ Falha ao auto-aprovar saque (seguirá pendente pra aprovação manual):", err);
      } finally {
        autoSession.endSession();
      }
    }

    if (autoProcessed) {
      await CashoutService.sendApprovedPixPayout(cashout);
    }

    res.status(201).json({
      status: true,
      msg: autoProcessed
        ? "✅ Saque automático processado — PIX enviado."
        : "✅ Solicitação de saque criada com sucesso e aguardando aprovação.",
      data: {
        id: (cashout._id as Types.ObjectId).toString(),
        amount: cashout.amount,
        fee: cashout.fee,
        netAmount: cashout.netAmount,
        status: cashout.status,
        createdAt: cashout.createdAt,
        autoProcessed,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("❌ Erro em createCashoutRequest:", error);
    res.status(500).json({
      status: false,
      msg: error.message || "Erro ao criar solicitação de saque.",
    });
  } finally {
    session.endSession();
  }
};

/* -------------------------------------------------------------------------- */
/* 🪙 1️⃣b Seller cria solicitação de saque em USDT (Zendry)                  */
/* -------------------------------------------------------------------------- */
/**
 * Ao contrário de createCashoutRequest, NÃO abre uma transação aqui —
 * CashoutService.createCryptoCashout gerencia suas próprias transações
 * internamente, de propósito (ver comentário na definição do método):
 * a chamada real à Zendry é irreversível e não pode ficar no meio de uma
 * transação que ainda pode abortar depois.
 */
export const createCryptoCashoutRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload?.id) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { amount, destinationAddress, pin } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ status: false, msg: "Valor de saque inválido." });
      return;
    }
    if (!destinationAddress || typeof destinationAddress !== "string") {
      res.status(400).json({ status: false, msg: "Endereço de destino (wallet USDT) é obrigatório." });
      return;
    }

    const user = await User.findById(payload.id);
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    const pinError = await checkWithdrawalPin(user, pin);
    if (pinError) {
      res.status(401).json({ status: false, msg: pinError });
      return;
    }

    const { cashout, usdtAmount } = await CashoutService.createCryptoCashout(
      user._id as Types.ObjectId,
      amount,
      destinationAddress
    );

    res.status(201).json({
      status: true,
      msg: "✅ Saque em USDT enviado com sucesso.",
      data: {
        id: (cashout._id as Types.ObjectId).toString(),
        amountBRL: cashout.amount,
        usdtAmount,
        destinationAddress: cashout.destinationAddress,
        status: cashout.status,
        externalReference: cashout.externalReference,
      },
    });
  } catch (error: any) {
    console.error("❌ Erro em createCryptoCashoutRequest:", error);
    res.status(400).json({
      status: false,
      msg: error.message || "Erro ao processar saque em USDT.",
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 📋 1️⃣c Seller lista os PRÓPRIOS saques (Pix + USDT)                       */
/* -------------------------------------------------------------------------- */
/**
 * Existe porque a "Histórico de Saques" do seller (TransfersPage.tsx) sempre
 * leu de GET /user/transactions filtrando type==="withdraw" — mas
 * CashoutRequest nunca gerou um documento em Transaction, só em
 * CashoutRequest e em wallet.log (interno). Resultado: nenhum saque JAMAIS
 * apareceu nessa tela, pra ninguém, desde que a feature existe — achado em
 * 2026-08-10 depois do seller reportar que um saque de R$3 "não apareceu em
 * histórico de saque".
 */
export const listMyCashoutRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload?.id) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const requests = await CashoutRequest.find({ userId: payload.id })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: true,
      data: requests.map((r: any) => ({
        id: r._id.toString(),
        amount: r.amount,
        fee: r.fee ?? null,
        netAmount: r.netAmount ?? null,
        origin: r.origin || "app",
        status: r.status,
        rail: r.rail,
        pixKeyType: r.pixKeyType || null,
        pixKey: r.pixKey || null,
        pixKeyHolderName: r.pixKeyHolderName || null,
        destinationAddress: r.destinationAddress || null,
        externalReference: r.externalReference || null,
        providerStatus: r.providerStatus || null,
        rejectionReason: r.rejectionReason || null,
        createdAt: r.createdAt,
        approvedAt: r.approvedAt || null,
      })),
    });
  } catch (error) {
    console.error("❌ Erro em listMyCashoutRequests:", error);
    res.status(500).json({ status: false, msg: "Erro ao listar seus saques." });
  }
};

/* -------------------------------------------------------------------------- */
/* 📋 2️⃣ Listar todas as solicitações de saque (admin/master)                */
/* -------------------------------------------------------------------------- */
export const listCashoutRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado." });
      return;
    }

    const requests = await CashoutRequest.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: true,
      total: requests.length,
      data: requests.map((r: any) => ({
        id: r._id.toString(),
        seller: r.userId,
        amount: r.amount,
        fee: r.fee ?? null,
        netAmount: r.netAmount ?? null,
        origin: r.origin || "app",
        status: r.status,
        rail: r.rail,
        pixKeyType: r.pixKeyType || null,
        pixKey: r.pixKey || null,
        pixKeyHolderName: r.pixKeyHolderName || null,
        destinationAddress: r.destinationAddress || null,
        externalReference: r.externalReference || null,
        providerStatus: r.providerStatus || null,
        createdAt: r.createdAt,
        approvedAt: r.approvedAt || null,
        rejectionReason: r.rejectionReason || null,
      })),
    });
  } catch (error) {
    console.error("❌ Erro em listCashoutRequests:", error);
    res.status(500).json({ status: false, msg: "Erro ao listar solicitações." });
  }
};

/* -------------------------------------------------------------------------- */
/* 🔓 3️⃣ Aprovar solicitação de saque (admin/master)                         */
/* -------------------------------------------------------------------------- */
export const approveCashoutRequest = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado. Somente admins podem aprovar." });
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID inválido." });
      return;
    }

    const { cashout, wallet } = await CashoutService.approveCashout(
      new Types.ObjectId(id),
      new Types.ObjectId(payload.id),
      session
    );

    await session.commitTransaction();

    // Só depois do commit — envio real à Zendry é irreversível, não pode
    // ficar no meio de uma transação que ainda pudesse abortar.
    await CashoutService.sendApprovedPixPayout(cashout);

    res.status(200).json({
      status: true,
      msg: "✅ Saque aprovado e PIX enviado.",
      data: {
        cashoutId: (cashout._id as Types.ObjectId).toString(),
        amount: cashout.amount,
        walletBalance: wallet.balance.available,
        externalReference: cashout.externalReference || null,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("❌ Erro em approveCashoutRequest:", error);
    res.status(500).json({ status: false, msg: error.message || "Erro ao aprovar saque." });
  } finally {
    session.endSession();
  }
};

/* -------------------------------------------------------------------------- */
/* 🚫 4️⃣ Rejeitar solicitação de saque (admin/master)                        */
/* -------------------------------------------------------------------------- */
export const rejectCashoutRequest = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado. Somente admins podem rejeitar." });
      return;
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID inválido." });
      return;
    }

    if (!reason) {
      res.status(400).json({ status: false, msg: "Motivo de rejeição é obrigatório." });
      return;
    }

    const { cashout, wallet } = await CashoutService.rejectCashout(
      new Types.ObjectId(id),
      new Types.ObjectId(payload.id),
      reason,
      session
    );

    await session.commitTransaction();

    res.status(200).json({
      status: true,
      msg: "🚫 Solicitação de saque rejeitada com sucesso.",
      data: {
        cashoutId: (cashout._id as Types.ObjectId).toString(),
        amount: cashout.amount,
        walletBalance: wallet.balance.available,
        reason: cashout.rejectionReason,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("❌ Erro em rejectCashoutRequest:", error);
    res.status(500).json({ status: false, msg: error.message || "Erro ao rejeitar saque." });
  } finally {
    session.endSession();
  }
};

/* -------------------------------------------------------------------------- */
/* ✍️ 5️⃣ Registrar saque feito manualmente no painel da Zendry (admin/master) */
/* -------------------------------------------------------------------------- */
/**
 * Workaround pra enquanto a Zendry está instável: o master faz o saque
 * direto no painel deles (fora do nosso app) e usa isso aqui só pra manter
 * o saldo interno batendo com o que realmente saiu de lá. Não manda Pix
 * nenhum — o dinheiro já saiu de verdade antes de chegar nessa tela.
 */
export const recordManualCashout = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado. Somente admins podem registrar saque manual." });
      return;
    }

    const { sellerEmail, netAmount, fee, note } = req.body;

    if (!sellerEmail || typeof sellerEmail !== "string") {
      res.status(400).json({ status: false, msg: "E-mail do seller é obrigatório." });
      return;
    }
    if (typeof netAmount !== "number" || netAmount <= 0) {
      res.status(400).json({ status: false, msg: "Valor recebido pelo seller (na Zendry) é obrigatório." });
      return;
    }
    if (typeof fee !== "number" || fee < 0) {
      res.status(400).json({ status: false, msg: "Taxa cobrada pela Zendry é obrigatória (pode ser 0)." });
      return;
    }

    const user = await User.findOne({ email: sellerEmail.toLowerCase().trim() });
    if (!user) {
      res.status(404).json({ status: false, msg: "Nenhum usuário encontrado com esse e-mail." });
      return;
    }

    const cashout = await CashoutService.recordManualWithdrawal(
      user._id as Types.ObjectId,
      netAmount,
      fee,
      new Types.ObjectId(payload.id),
      typeof note === "string" ? note : undefined
    );

    res.status(201).json({
      status: true,
      msg: "✅ Saque manual registrado — saldo ajustado.",
      data: {
        cashoutId: (cashout._id as Types.ObjectId).toString(),
        amount: cashout.amount,
        fee: cashout.fee,
        netAmount: cashout.netAmount,
      },
    });
  } catch (error: any) {
    console.error("❌ Erro em recordManualCashout:", error);
    res.status(500).json({ status: false, msg: error.message || "Erro ao registrar saque manual." });
  }
};
