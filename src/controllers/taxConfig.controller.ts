// src/controllers/taxConfig.controller.ts
import { Request, Response } from "express";
import { Seller } from "../models/seller.model";

/**
 * 💰 Atualiza as taxas e reserva financeira do seller.
 * - Permite alterar percentuais e dias de retenção.
 * - Tudo dentro de Seller.financialConfig.
 */
export const updateTaxConfig = async (req: Request, res: Response) => {
  try {
    const { sellerId, fees, reserve } = req.body;

    if (!sellerId) {
      return res.status(400).json({
        status: false,
        msg: "Campo obrigatório: sellerId.",
      });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        status: false,
        msg: "Seller não encontrado.",
      });
    }

    // Atualiza taxas
    if (fees) {
      seller.financialConfig.fees = {
        ...seller.financialConfig.fees,
        ...fees,
      };
    }

    // Atualiza reserva
    if (reserve) {
      seller.financialConfig.reserve = {
        ...seller.financialConfig.reserve,
        ...reserve,
      };
    }

    await seller.save();

    return res.status(200).json({
      status: true,
      msg: "Configuração de taxas e reserva atualizada com sucesso.",
      data: seller.financialConfig,
    });
  } catch (error) {
    console.error("❌ Erro ao atualizar configuração de taxas:", error);
    return res.status(500).json({
      status: false,
      msg: "Erro interno ao atualizar configuração de taxas.",
    });
  }
};
