import { resolveAcquirer, AcquirerKey } from "./index";

/**
 * Alias para compatibilidade retroativa.
 * Exemplo: getAcquirer("stripe") → instancia StripeAcquirer
 */
export function getAcquirer(key: AcquirerKey) {
  return resolveAcquirer(key);
}
