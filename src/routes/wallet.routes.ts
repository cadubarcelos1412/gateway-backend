import express, { Router, Request, Response } from "express";
import { Wallet } from "../models/wallet.model";

const router: Router = express.Router();

/**
 * @route POST /api/wallet/simulate-unavailable
 * @desc Simula saldo indisponível (para testes locais)
 */
router.post(
  "/simulate-unavailable",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, amount } = req.body;

      if (!userId || !amount) {
        res.status(400).json({ status: false, msg: "userId e amount são obrigatórios." });
        return;
      }

      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        res.status(404).json({ status: false, msg: "Carteira não encontrada." });
        return;
      }

      wallet.balance.unAvailable.push({
        amount,
        availableIn: new Date(Date.now() - 10 * 60 * 1000), // 10 min atrás
      });

      await wallet.save();

      res.status(200).json({
        status: true,
        msg: "Saldo indisponível simulado com sucesso.",
        wallet,
      });
    } catch (error) {
      console.error("❌ Erro ao simular saldo indisponível:", error);
      res.status(500).json({ status: false, msg: "Erro interno." });
    }
  }
);

export default router;
