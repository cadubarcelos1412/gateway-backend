// src/controllers/taxConfig.controller.ts
import { Request, Response } from "express";
import { Seller } from "../models/seller.model";
import { FinancialAudit } from "../models/financialAudit.model";

/**
 * 💰 Atualiza as taxas e reserva financeira do seller.
 * - Inclui log de auditoria no FinancialAudit.
 */
export const updateTaxConfig = async (req: Request, res: Response) => {
  try {
    const { sellerId, fees, reserve, performedBy } = req.body;

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

    const oldConfig = { ...seller.financialConfig };

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

    // 🔍 Log de auditoria
    await FinancialAudit.create({
      sellerId,
      action: "update_tax_config",
      oldValue: oldConfig,
      newValue: seller.financialConfig,
      performedBy: performedBy || "master_panel",
      createdAt: new Date(),
    });

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
