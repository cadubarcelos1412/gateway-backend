/**
 * 📦 src/acquirers/index.ts
 * Ponto único de entrada para toda a camada de adquirentes.
 *
 * - Centraliza todos os adapters
 * - Permite resolver dinamicamente qual adquirente usar em tempo de execução
 * - Facilita expansão futura (ex: Adyen, Stone, Cielo, etc.)
 *
 * Pagar.me e ReflowPay foram removidos (2026-08-06) — nenhum seller usava, e
 * não eram integrações reais/confirmadas (Pagar.me nunca teve credencial de
 * produção de verdade; ReflowPay/Cashtime era código morto, nunca chamado
 * por nenhuma rota). Só Zendry é suportada hoje.
 */

import { IAcquirer } from "./IAcquirer";
import { ZendryAcquirer } from "./zendry.acquirer";

/* -------------------------------------------------------------------------- */
/* 🧠 Tipos e constantes centrais                                             */
/* -------------------------------------------------------------------------- */

// Lista de chaves de adquirentes suportadas atualmente
export type AcquirerKey = "zendry";

// Se precisar adicionar novas, basta incluir aqui
export const ACQUIRER_KEYS: readonly AcquirerKey[] = ["zendry"] as const;

/* -------------------------------------------------------------------------- */
/* 🏭 Registro de Adapters (Factory Map)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cada adquirente registrado precisa implementar a interface IAcquirer.
 * Isso garante que todos tenham os mesmos métodos públicos.
 */
export const ACQUIRER_REGISTRY: Record<AcquirerKey, new () => IAcquirer> = {
  zendry: ZendryAcquirer,
};

/* -------------------------------------------------------------------------- */
/* 🧰 Função utilitária principal – resolveAcquirer                           */
/* -------------------------------------------------------------------------- */

/**
 * resolveAcquirer — instancia dinamicamente um adapter com base na chave.
 *
 * @example
 * const acquirer = resolveAcquirer("zendry");
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

// Expor adapter diretamente (útil para testes e debug)
export { ZendryAcquirer } from "./zendry.acquirer";
