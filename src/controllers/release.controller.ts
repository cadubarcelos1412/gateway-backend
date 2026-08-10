import { Request, Response } from "express";
import { Wallet } from "../models/wallet.model";
import { decodeToken } from "../config/auth";
import { releaseMaturedBalance } from "../services/wallet.service";

/**
 * Endpoint manual — mantido por compatibilidade, mas não é mais o único
 * jeito de liberar saldo maduro (ver getMyWallet em me.controller.ts, que
 * libera na leitura, e a varredura periódica em server.ts).
 */
export const releaseBalance = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization;
    if (!token) {
      res.status(403).json({ status: false, msg: "Token ausente." });
      return;
    }

    const payload = await decodeToken(token.replace("Bearer ", ""));
    if (!payload?.id) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const wallet = await Wallet.findOne({ userId: payload.id });
    if (!wallet) {
      res.status(404).json({ status: false, msg: "Carteira não encontrada." });
      return;
    }

    const releasedAmount = await releaseMaturedBalance(wallet);

    res.status(200).json({
      status: true,
      msg: `✅ ${releasedAmount.toFixed(2)} liberado com sucesso.`,
      balance: wallet.balance,
    });
  } catch (error) {
    console.error("❌ Erro em releaseBalance:", error);
    res.status(500).json({ status: false, msg: "Erro ao liberar saldo." });
  }
};
