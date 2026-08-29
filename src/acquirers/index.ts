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
 * por nenhuma rota). Zendry e Sttart (contrato assinado 2026-08-18) são as
 * adquirentes suportadas hoje — roteamento por seller (Seller.acquirer, ver
 * seller.model.ts) já existente na plataforma.
 */

import { IAcquirer } from "./IAcquirer";
import { ZendryAcquirer } from "./zendry.acquirer";
import { SttartAcquirer } from "./sttart.acquirer";
import { AcquirerCapability, SellerAcquirerShape } from "./types";

/* -------------------------------------------------------------------------- */
/* 🧠 Tipos e constantes centrais                                             */
/* -------------------------------------------------------------------------- */

// Lista de chaves de adquirentes suportadas atualmente
export type AcquirerKey = "zendry" | "sttart";

// Se precisar adicionar novas, basta incluir aqui
export const ACQUIRER_KEYS: readonly AcquirerKey[] = ["zendry", "sttart"] as const;

/* -------------------------------------------------------------------------- */
/* 🏭 Registro de Adapters (Factory Map)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cada adquirente registrado precisa implementar a interface IAcquirer.
 * Isso garante que todos tenham os mesmos métodos públicos.
 */
export const ACQUIRER_REGISTRY: Record<AcquirerKey, new () => IAcquirer> = {
  zendry: ZendryAcquirer,
  sttart: SttartAcquirer,
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

/**
 * resolveSellerAcquirer — decide qual adquirente usar pra um MÉTODO
 * específico (Pix/cartão/swap) de um seller, seguindo a cascata de
 * fallback (2026-08-30, ver models/seller.model.ts):
 *
 *   1. `acquirerConfig[capability]` presente e é `"zendry"`/`"sttart"` →
 *      usa exatamente esse valor, ignora `acquirer` (campo antigo).
 *   2. `acquirerConfig[capability]` é `null` (explícito) → método
 *      DESLIGADO de propósito — lança erro de negócio, nunca cai num
 *      acquirer "por acidente".
 *   3. `acquirerConfig[capability]` ausente/undefined → cai pro
 *      `acquirer` antigo (comportamento de sempre, sellers nunca
 *      migrados pra config nova continuam funcionando igual).
 *
 * Função pura (não toca banco/rede) — só decide QUAL chave usar; quem
 * chama ainda precisa de `resolveAcquirer(key)` pra pegar a instância.
 */
export function resolveSellerAcquirer(
  seller: SellerAcquirerShape,
  capability: AcquirerCapability
): AcquirerKey {
  const configured = seller.acquirerConfig?.[capability];

  if (configured === null) {
    const CAPABILITY_LABEL: Record<AcquirerCapability, string> = {
      pix: "Pix",
      card: "Cartão",
      swap: "Saque em USDT",
    };
    throw new Error(`${CAPABILITY_LABEL[capability]} não está habilitado pra essa conta.`);
  }

  return (configured ?? seller.acquirer ?? "zendry") as AcquirerKey;
}

/* -------------------------------------------------------------------------- */
/* 📦 Re-exports convenientes                                                 */
/* -------------------------------------------------------------------------- */

// Tipos globais compartilhados
export * from "./types";
export * from "./IAcquirer";

// Expor adapter diretamente (útil para testes e debug)
export { ZendryAcquirer } from "./zendry.acquirer";
export { SttartAcquirer } from "./sttart.acquirer";
