// src/acquirers/factory.ts
import { AcquirerKey } from "./index";
import { selectAcquirer } from "./acquirerSelector";
import { PagarmeAcquirer } from "./pagarme.acquirer";

/**
 * 🏭 Factory responsável por retornar a instância correta da adquirente.
 * - Atualmente, a Kissa opera apenas com a Pagar.me.
 * - Caso novas adquirentes sejam integradas no futuro, basta adicioná-las aqui.
 */
export async function createAcquirer(sellerId?: string) {
  const acquirerKey: AcquirerKey = await selectAcquirer(sellerId);

  switch (acquirerKey) {
    case "pagarme":
    default:
      if (acquirerKey !== "pagarme") {
        console.warn(
          `⚠️ Acquirer "${acquirerKey}" não reconhecida. Usando Pagar.me como fallback.`
        );
      }
      return new PagarmeAcquirer();
  }
}
