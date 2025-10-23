import { IAcquirer } from "./IAcquirer";
import { StripeAcquirer } from "./stripe.acquirer";
import { PagarmeAcquirer } from "./pagarme.acquirer";
import { AcquirerKey } from "./index";

/**
 * 🏭 getAcquirer – Factory simples de adapters
 *
 * Instancia o adapter correto com base na chave da adquirente.
 * 
 * @param acquirer - Chave da adquirente ("stripe" | "pagarme")
 * @returns Instância de IAcquirer pronta para uso
 *
 * @example
 * const acquirer = getAcquirer("pagarme");
 * await acquirer.createTransaction(dto);
 */
export function getAcquirer(acquirer: AcquirerKey): IAcquirer {
  switch (acquirer) {
    case "stripe":
      return new StripeAcquirer();
    case "pagarme":
      return new PagarmeAcquirer();
    default:
      throw new Error(`❌ Adquirente não suportada: ${acquirer}`);
  }
}
