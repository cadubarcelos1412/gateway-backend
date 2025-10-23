// src/acquirers/pagarme.acquirer.ts
import { IAcquirer } from "./IAcquirer";
import { CreateTransactionDTO, CreateTransactionResult } from "./types";

/**
 * 🏦 PagarmeAcquirer
 * Adapter responsável por integrar transações com a adquirente Pagar.me.
 * Implementa a interface IAcquirer garantindo compatibilidade com o core.
 */
export class PagarmeAcquirer implements IAcquirer {
  async createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult> {
    /**
     * 🚧 Aqui será feita a integração real com a API da Pagar.me.
     * No momento, estamos retornando um mock seguro para manter o fluxo contábil ativo.
     */

    return {
      externalId: "mock_pagarme_tx_001",
      acquirer: "pagarme",
      rawResponse: { mock: true },
      status: "pending", // valores possíveis: 'pending' | 'approved' | 'failed'
    };
  }
}
