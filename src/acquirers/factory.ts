import { IAcquirer } from "./IAcquirer";
import { PagarmeAcquirer } from "./pagarme.acquirer";
import { ZendryAcquirer } from "./zendry.acquirer";
import { AcquirerKey } from "./index";

/**
 * 🏭 getAcquirer – Factory simples de adapters
 *
 * Instancia o adapter correto com base na chave da adquirente.
 *
 * @param acquirer - Chave da adquirente ("pagarme")
 * @returns Instância de IAcquirer pronta para uso
 *
 * @example
 * const acquirer = getAcquirer("pagarme");
 * await acquirer.createTransaction(dto);
 */
export function getAcquirer(acquirer: AcquirerKey): IAcquirer {
  switch (acquirer) {
    case "pagarme":
      return new PagarmeAcquirer();
    case "zendry":
      return new ZendryAcquirer();
    default:
      throw new Error(`❌ Adquirente não suportada: ${acquirer}`);
  }
}
