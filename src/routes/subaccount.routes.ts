// src/routes/subaccount.routes.ts
import { Router, Request, Response } from "express";
import { Subaccount } from "../models/subaccount.model";
import { decodeToken } from "../config/auth";

const router = Router();

/**
 * @route GET /api/subaccounts/me
 * @desc  Ver a subconta do seller logado
 * @access Autenticado
 */
router.get("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ status: false, msg: "Token ausente." });
      return;
    }

    const payload = await decodeToken(token);
    if (!payload?.id) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const subaccount = await Subaccount.findOne({ sellerId: payload.id }).lean();
    if (!subaccount) {
      res.status(404).json({ status: false, msg: "Subconta não encontrada." });
      return;
    }

    res.status(200).json({ status: true, subaccount });
  } catch (error) {
    console.error("❌ Erro ao buscar subconta:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar subconta." });
  }
});

export default router;
