/**
 * 📦 src/acquirers/index.ts
 * Ponto único de entrada para toda a camada de adquirentes.
 *
 * - Centraliza todos os adapters (Pagar.me, etc.)
 * - Permite resolver dinamicamente qual adquirente usar em tempo de execução
 * - Facilita expansão futura (ex: Adyen, Stone, Cielo, etc.)
 */

import { IAcquirer } from "./IAcquirer";
import { PagarmeAcquirer } from "./pagarme.acquirer";
import { ZendryAcquirer } from "./zendry.acquirer";

/* -------------------------------------------------------------------------- */
/* 🧠 Tipos e constantes centrais                                             */
/* -------------------------------------------------------------------------- */

// Lista de chaves de adquirentes suportadas atualmente
export type AcquirerKey = "pagarme" | "zendry";

// Se precisar adicionar novas, basta incluir aqui
export const ACQUIRER_KEYS: readonly AcquirerKey[] = ["pagarme", "zendry"] as const;

/* -------------------------------------------------------------------------- */
/* 🏭 Registro de Adapters (Factory Map)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cada adquirente registrado precisa implementar a interface IAcquirer.
 * Isso garante que todos tenham os mesmos métodos públicos.
 */
export const ACQUIRER_REGISTRY: Record<AcquirerKey, new () => IAcquirer> = {
  pagarme: PagarmeAcquirer,
  zendry: ZendryAcquirer,
};

/* -------------------------------------------------------------------------- */
/* 🧰 Função utilitária principal – resolveAcquirer                           */
/* -------------------------------------------------------------------------- */

/**
 * resolveAcquirer — instancia dinamicamente um adapter com base na chave.
 *
 * @example
 * const acquirer = resolveAcquirer("pagarme");
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
export { PagarmeAcquirer } from "./pagarme.acquirer";
export { ZendryAcquirer } from "./zendry.acquirer";
