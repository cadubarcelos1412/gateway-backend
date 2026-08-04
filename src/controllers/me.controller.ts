import { Request, Response } from "express";
import { decodeToken } from "../config/auth";
import { User } from "../models/user.model";
import { Wallet } from "../models/wallet.model";
import { Transaction } from "../models/transaction.model";
import { Product } from "../models/product.model";
import { Checkout } from "../models/checkout.model";

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
    const user = await User.findById(userId).select("-password").lean();
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
    const wallet = await Wallet.findOne({ userId }).lean();
    if (!wallet) {
      res.status(404).json({ status: false, msg: "Carteira não encontrada." });
      return;
    }
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
