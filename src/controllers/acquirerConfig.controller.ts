// src/controllers/acquirerConfig.controller.ts
import { Request, Response } from "express";
import { Seller } from "../models/seller.model";

/**
 * 🏦 Atualiza a adquirente configurada de um seller.
 * - Permite ao Master definir qual adquirente o seller vai usar.
 * - As opções válidas são "pagarme" (padrão) ou outras futuras integradas.
 */
export const updateAcquirerConfig = async (req: Request, res: Response) => {
  try {
    const { sellerId, acquirer } = req.body;

    if (!sellerId || !acquirer) {
      return res.status(400).json({
        status: false,
        msg: "Campos obrigatórios: sellerId e acquirer.",
      });
    }

    const validAcquirers = ["pagarme"];
    if (!validAcquirers.includes(acquirer)) {
      return res.status(400).json({
        status: false,
        msg: `Acquirer inválida. Use uma das seguintes: ${validAcquirers.join(", ")}.`,
      });
    }

    const seller = await Seller.findByIdAndUpdate(
      sellerId,
      { "financialConfig.acquirer": acquirer },
      { new: true }
    );

    if (!seller) {
      return res.status(404).json({
        status: false,
        msg: "Seller não encontrado.",
      });
    }

    return res.status(200).json({
      status: true,
      msg: "Configuração de adquirente atualizada com sucesso.",
      data: {
        sellerId: seller.id,
        acquirer: seller.financialConfig.acquirer,
      },
    });
  } catch (error) {
    console.error("❌ Erro ao atualizar adquirente:", error);
    return res.status(500).json({
      status: false,
      msg: "Erro interno ao atualizar adquirente.",
    });
  }
};
