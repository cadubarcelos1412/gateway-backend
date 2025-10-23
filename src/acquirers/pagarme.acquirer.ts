import { CreateTransactionDTO, CreateTransactionResult } from "./types";
import { IAcquirer } from "./IAcquirer";

export class PagarmeAcquirer implements IAcquirer {
  async createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult> {
    // Aqui ficaria a integração real com a API da Pagar.me
    return {
      externalId: "mock_pagarme_tx_001",
      acquirer: "pagarme",
      rawResponse: { mock: true },
      status: "pending",
      postbackUrl: payload.postbackUrl,
    };
  }
}
