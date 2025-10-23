// 📂 src/acquirers/acquirerSelector.ts
import { PaymentMethod } from "./types";
import { ISeller } from "../models/seller.model";
import { AcquirerKey, ACQUIRER_KEYS } from "./index";

interface AcquirerSelectorInput {
  amount: number;
  method: PaymentMethod;
  seller: ISeller;
  country?: string;
}

/* -------------------------------------------------------------------------- */
/* 🧠 AcquirerSelector – Decide qual adquirente usar para cada transação      */
/* -------------------------------------------------------------------------- */
/**
 * 📌 Objetivo:
 * Centralizar toda a lógica de decisão sobre qual adquirente será usada
 * para processar cada transação.
 *
 * Hoje essa decisão é controlada por nós (a subadquirente), mas a classe
 * já nasce preparada para comportar lógica dinâmica no futuro.
 */
export class AcquirerSelector {
  static resolve(input: AcquirerSelectorInput): AcquirerKey {
    const { amount, method, seller, country } = input;

    /* ---------------------------------------------------------------------- */
    /* ✅ Regra 1 – Acquirer preferida configurada no seller                  */
    /* ---------------------------------------------------------------------- */
    if (
      "preferredAcquirer" in seller &&
      seller.preferredAcquirer &&
      ACQUIRER_KEYS.includes(seller.preferredAcquirer as AcquirerKey)
    ) {
      return seller.preferredAcquirer as AcquirerKey;
    }

    /* ---------------------------------------------------------------------- */
    /* ✅ Regra 2 – PIX e Boleto: priorizar adquirente nacional               */
    /* ---------------------------------------------------------------------- */
    if (method === "pix" || method === "boleto") {
      return "pagarme";
    }

    /* ---------------------------------------------------------------------- */
    /* ✅ Regra 3 – Valores altos: priorizar Stripe pelo antifraude           */
    /* ---------------------------------------------------------------------- */
    if (amount > 20000) {
      return "stripe";
    }

    /* ---------------------------------------------------------------------- */
    /* ✅ Regra 4 – Países estrangeiros (se quisermos usar isso futuramente) */
    /* ---------------------------------------------------------------------- */
    if (country && country !== "BR") {
      return "stripe";
    }

    /* ---------------------------------------------------------------------- */
    /* ✅ Regra 5 – Fallback padrão                                           */
    /* ---------------------------------------------------------------------- */
    return "pagarme";
  }
}
