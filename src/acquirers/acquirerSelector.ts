// src/acquirers/acquirerSelector.ts
import { AcquirerKey } from "./index";

/**
 * Retorna a adquirente a ser usada com base em regras simples.
 * (Por enquanto, fixa em "pagarme" até termos múltiplas ativas)
 */
export function selectAcquirer(_sellerId?: string): AcquirerKey {
  return "pagarme";
}
