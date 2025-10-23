/**
 * 📦 src/acquirers/index.ts
 * Ponto único de entrada para toda a camada de adquirentes.
 *
 * - Centraliza todos os adapters (Stripe, Pagar.me, etc.)
 * - Permite resolver dinamicamente qual adquirente usar em tempo de execução
 * - Facilita expansão futura (ex: Adyen, Stone, Cielo, etc.)
 */

import { IAcquirer } from "./IAcquirer";
import { StripeAcquirer } from "./stripe.acquirer";
import { PagarmeAcquirer } from "./pagarme.acquirer";

/* -------------------------------------------------------------------------- */
/* 🧠 Tipos e constantes centrais                                             */
/* -------------------------------------------------------------------------- */

// Lista de chaves de adquirentes suportadas atualmente
export type AcquirerKey = "stripe" | "pagarme";

// Se precisar adicionar novas, basta incluir aqui
export const ACQUIRER_KEYS: readonly AcquirerKey[] = ["stripe", "pagarme"] as const;

/* -------------------------------------------------------------------------- */
/* 🏭 Registro de Adapters (Factory Map)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cada adquirente registrado precisa implementar a interface IAcquirer.
 * Isso garante que todos tenham os mesmos métodos públicos.
 */
export const ACQUIRER_REGISTRY: Record<AcquirerKey, new () => IAcquirer> = {
  stripe: StripeAcquirer,
  pagarme: PagarmeAcquirer,
};

/* -------------------------------------------------------------------------- */
/* 🧰 Função utilitária principal – resolveAcquirer                           */
/* -------------------------------------------------------------------------- */

/**
 * resolveAcquirer — instancia dinamicamente um adapter com base na chave.
 *
 * @example
 * const acquirer = resolveAcquirer("stripe");
 * await acquirer.createTransaction(dto);
 */
export function resolveAcquirer(key: AcquirerKey): IAcquirer {
  const Adapter = ACQUIRER_REGISTRY[key];
  if (!Adapter) {
    throw new Error(`❌ Adquirente não suportada: ${key}`);
  }
  return new Adapter();
}

/* -------------------------------------------------------------------------- */
/* 📦 Re-exports convenientes                                                 */
/* -------------------------------------------------------------------------- */

// Tipos globais compartilhados
export * from "./types";
export * from "./IAcquirer";

// Fábrica alternativa (mantida para compatibilidade)
export { getAcquirer } from "./factory";

// Expor adapters diretamente (útil para testes e debug)
export { StripeAcquirer } from "./stripe.acquirer";
export { PagarmeAcquirer } from "./pagarme.acquirer";
