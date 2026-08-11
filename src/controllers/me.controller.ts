import { Request, Response } from "express";
import mongoose from "mongoose";
import { decodeToken } from "../config/auth";
import { User } from "../models/user.model";
import { Wallet } from "../models/wallet.model";
import { Transaction } from "../models/transaction.model";
import { Product } from "../models/product.model";
import { Checkout } from "../models/checkout.model";
import { Seller } from "../models/seller.model";
import { getOrCreateDefaultFeeConfig } from "../models/systemFeeConfig.model";
import { AnticipationService } from "../services/anticipation.service";
import { AnticipationTier } from "../models/anticipationRequest.model";
import { releaseMaturedBalance } from "../services/wallet.service";

/**
 * 🔐 Extrai e valida o id do usuário logado a partir do Bearer token.
 * Retorna null (e já responde 401) se o token estiver ausente/inválido.
 */
async function getAuthUserId(req: Request, res: Response): Promise<string | null> {
  const rawToken = req.headers.authorization?.replace("Bearer ", "");
  if (!rawToken) {
    res.status(401).json({ status: false, msg: "Token ausente." });
    return null;
  }

  const payload = await decodeToken(rawToken);
  if (!payload?.id) {
    res.status(401).json({ status: false, msg: "Token inválido." });
    return null;
  }

  return payload.id;
}

/**
 * GET /api/user/me
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  const userId = await getAuthUserId(req, res);
  if (!userId) return;

  try {
    const user = await User.findById(userId).select("-password -withdrawalPin.hash").lean();
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }
    res.status(200).json({ status: true, user });
  } catch (err) {
    console.error("❌ Erro em getMe:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar usuário." });
  }
};

/**
 * GET /api/user/wallet
 */
export const getMyWallet = async (req: Request, res: Response): Promise<void> => {
  const userId = await getAuthUserId(req, res);
  if (!userId) return;

  try {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      res.status(404).json({ status: false, msg: "Carteira não encontrada." });
      return;
    }

    // Libera na leitura qualquer reserva cujo prazo já passou — sem isso, o
    // saldo fica preso pra sempre, já que nada mais chama esse release
    // automaticamente (ver wallet.service.ts).
    await releaseMaturedBalance(wallet);

    // Traz junto quem comprou e o que foi vendido pra cada reserva —
    // originTransactionId já existia no schema, só não era usado. Sem isso o
    // "Saldo a receber" só mostrava um valor solto, sem dizer de qual venda
    // era (pedido do seller em 2026-08-10).
    await wallet.populate({
      path: "balance.unAvailable.originTransactionId",
      select: "amount netAmount method createdAt purchaseData.customer.name purchaseData.products",
    });

    res.status(200).json({ status: true, wallet });
  } catch (err) {
    console.error("❌ Erro em getMyWallet:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar carteira." });
  }
};

/**
 * GET /api/user/transactions
 */
export const getMyTransactions = async (req: Request, res: Response): Promise<void> => {
  const userId = await getAuthUserId(req, res);
  if (!userId) return;

  try {
    const transactions = await Transaction.find({ userId }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ status: true, transactions });
  } catch (err) {
    console.error("❌ Erro em getMyTransactions:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar transações." });
  }
};

/**
 * GET /api/user/products
 */
export const getMyProducts = async (req: Request, res: Response): Promise<void> => {
  const userId = await getAuthUserId(req, res);
  if (!userId) return;

  try {
    const products = await Product.find({ userId }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ status: true, products });
  } catch (err) {
    console.error("❌ Erro em getMyProducts:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar produtos." });
  }
};

/**
 * GET /api/user/checkouts
 */
export const getMyCheckouts = async (req: Request, res: Response): Promise<void> => {
  const userId = await getAuthUserId(req, res);
  if (!userId) return;

  try {
    const checkouts = await Checkout.find({ userId }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ status: true, checkouts });
  } catch (err) {
    console.error("❌ Erro em getMyCheckouts:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar checkouts." });
  }
};

/**
 * GET /api/user/credentials
 * Retorna as credenciais/integrações do usuário (webhook, utmify) — nunca o secret em claro na listagem.
 */
export const getMyCredentials = async (req: Request, res: Response): Promise<void> => {
  const userId = await getAuthUserId(req, res);
  if (!userId) return;

  try {
    const user = await User.findById(userId).select("token").lean();
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }
    res.status(200).json({
      status: true,
      credentials: {
        webhook: user.token?.webhook ?? {},
        utmify: { apiKey: user.token?.utmify?.apiKey ? "••••••••" : null },
        hasSecret: Boolean(user.token?.secret),
      },
    });
  } catch (err) {
    console.error("❌ Erro em getMyCredentials:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar credenciais." });
  }
};

/**
 * GET /api/user/fees
 * Retorna a tabela de taxas efetiva do seller logado (override próprio, ou o
 * padrão global se ele ainda não tiver um snapshot individual).
 */
export const getMyFees = async (req: Request, res: Response): Promise<void> => {
  const userId = await getAuthUserId(req, res);
  if (!userId) return;

  try {
    const seller = await Seller.findOne({ userId }).lean();
    if (!seller) {
      res.status(404).json({ status: false, msg: "Perfil de seller não encontrado." });
      return;
    }

    const feeTable = seller.feeTable ?? (await getOrCreateDefaultFeeConfig()).feeTable;
    res.status(200).json({ status: true, feeTable });
  } catch (err) {
    console.error("❌ Erro em getMyFees:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar taxas." });
  }
};

/**
 * POST /api/user/wallet/anticipate
 * body: { unAvailableEntryId, tier: "day15" | "day2" }
 */
export const anticipateWallet = async (req: Request, res: Response): Promise<void> => {
  const userId = await getAuthUserId(req, res);
  if (!userId) return;

  const { unAvailableEntryId, tier } = req.body as { unAvailableEntryId?: string; tier?: AnticipationTier };

  if (!unAvailableEntryId || !["day15", "day2"].includes(tier || "")) {
    res.status(400).json({ status: false, msg: "unAvailableEntryId e tier ('day15' ou 'day2') são obrigatórios." });
    return;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { payoutAmount, extraFeeAmount } = await AnticipationService.anticipate(
      new mongoose.Types.ObjectId(userId),
      unAvailableEntryId,
      tier as AnticipationTier,
      session
    );
    await session.commitTransaction();

    res.status(200).json({
      status: true,
      msg: "✅ Antecipação realizada com sucesso.",
      payoutAmount,
      extraFeeAmount,
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("❌ Erro em anticipateWallet:", error);
    res.status(400).json({ status: false, msg: error.message || "Erro ao antecipar saldo." });
  } finally {
    session.endSession();
  }
};
