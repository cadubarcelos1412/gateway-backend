/**
 * 📦 src/acquirers/index.ts
 * Ponto único de entrada para toda a camada de adquirentes.
 */

import { IAcquirer } from "./IAcquirer";
import { StripeAcquirer } from "./stripe.acquirer";
import { PagarmeAcquirer } from "./pagarme.acquirer";

/* -------------------------------------------------------------------------- */
/* 🧠 Tipos e constantes centrais                                             */
/* -------------------------------------------------------------------------- */

export type AcquirerKey = "stripe" | "pagarme";
export const ACQUIRER_KEYS: readonly AcquirerKey[] = ["stripe", "pagarme"] as const;

/* -------------------------------------------------------------------------- */
/* 🏭 Registro de Adapters (Factory Map)                                      */
/* -------------------------------------------------------------------------- */

export const ACQUIRER_REGISTRY: Record<AcquirerKey, new () => IAcquirer> = {
  stripe: StripeAcquirer,
  pagarme: PagarmeAcquirer,
};

/* -------------------------------------------------------------------------- */
/* 🧰 Função utilitária principal – resolveAcquirer                           */
/* -------------------------------------------------------------------------- */

export function resolveAcquirer(key: AcquirerKey): IAcquirer {
  const Adapter = ACQUIRER_REGISTRY[key];
  if (!Adapter) throw new Error(`❌ Adquirente não suportada: ${key}`);
  return new Adapter();
}

/* -------------------------------------------------------------------------- */
/* 📦 Re-exports convenientes                                                 */
/* -------------------------------------------------------------------------- */

// Tipos globais compartilhados
export * from "./types";
export * from "./IAcquirer";

// Expor adapters diretamente (útil para testes e debug)
export { StripeAcquirer } from "./stripe.acquirer";
export { PagarmeAcquirer } from "./pagarme.acquirer";
