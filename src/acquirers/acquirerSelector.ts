// src/acquirers/acquirerSelector.ts
import { Seller } from "../models/seller.model";
import { AcquirerKey } from "./index";

/**
 * 🧩 Seleciona dinamicamente a adquirente do seller.
 * - Lê do campo Seller.financialConfig.acquirer
 * - Se não existir, usa "pagarme" como padrão
 */
export async function selectAcquirer(sellerId?: string): Promise<AcquirerKey> {
  try {
    if (!sellerId) return "pagarme";

    const seller = await Seller.findById(sellerId)
      .select("financialConfig.acquirer")
      .lean();

    const acquirer = seller?.financialConfig?.acquirer || "pagarme";
    return acquirer as AcquirerKey;
  } catch (error) {
    console.error("❌ Erro ao selecionar adquirente:", error);
    return "pagarme";
  }
}
