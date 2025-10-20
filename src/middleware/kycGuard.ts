import { Request, Response, NextFunction } from "express";
import { decodeToken } from "../config/auth";
import { Seller } from "../models/seller.model";

/**
 * 🔐 Middleware global de proteção de operações financeiras
 * - Bloqueia qualquer transação se o KYC do seller não estiver aprovado.
 * - Status permitidos: "approved" ou "active"
 * - Status bloqueados: "pending", "under_review", "rejected"
 */

export const requireApprovedKyc = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawToken = req.headers.authorization?.replace("Bearer ", "");
    if (!rawToken) {
      res.status(401).json({ status: false, msg: "Token ausente." });
      return;
    }

    const payload = await decodeToken(rawToken);
    if (!payload || !payload.id) {
      res.status(401).json({ status: false, msg: "Token inválido." });
      return;
    }

    const seller = await Seller.findOne({ userId: payload.id });
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    if (seller.kycStatus !== "approved" && seller.kycStatus !== "active") {
      res.status(403).json({
        status: false,
        msg: `❌ Operação bloqueada: KYC com status '${seller.kycStatus}'. Complete a verificação antes de operar.`,
      });
      return;
    }

    // ✅ Tudo certo, segue para a rota
    next();
  } catch (error) {
    console.error("💥 Erro no middleware requireApprovedKyc:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao validar KYC." });
  }
};
