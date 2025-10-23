// src/acquirers/index.ts
import { IAcquirer } from "./IAcquirer";
import { PagarmeAcquirer } from "./pagarme.acquirer";

/* -------------------------------------------------------------------------- */
/* 🧠 Tipos e constantes centrais                                             */
/* -------------------------------------------------------------------------- */

/** Lista de chaves de adquirentes suportadas no sistema */
export type AcquirerKey = "pagarme";

/** Chaves registradas para expansão futura (ex: Adyen, Stone, Cielo...) */
export const ACQUIRER_KEYS: readonly AcquirerKey[] = ["pagarme"] as const;

/* -------------------------------------------------------------------------- */
/* 🏭 Registro de Adapters (Factory Map)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cada adquirente precisa implementar a interface IAcquirer,
 * garantindo consistência entre todas as integrações.
 */
export const ACQUIRER_REGISTRY: Record<AcquirerKey, new () => IAcquirer> = {
  pagarme: PagarmeAcquirer,
};

/* -------------------------------------------------------------------------- */
/* 🧰 resolveAcquirer – instancia dinamicamente o adapter solicitado          */
/* -------------------------------------------------------------------------- */

/**
 * Retorna dinamicamente a adquirente configurada.
 * @param key Chave da adquirente ("pagarme")
 * @example
 * const acquirer = resolveAcquirer("pagarme");
 * await acquirer.createTransaction(dto);
 */
export function resolveAcquirer(key: AcquirerKey): IAcquirer {
  const Adapter = ACQUIRER_REGISTRY[key];
  if (!Adapter) throw new Error(`❌ Adquirente não suportada: ${key}`);
  return new Adapter();
}

/* -------------------------------------------------------------------------- */
/* 📦 Re-exports convenientes                                                 */
/* -------------------------------------------------------------------------- */

export * from "./types";
export * from "./IAcquirer";
export { PagarmeAcquirer } from "./pagarme.acquirer";
