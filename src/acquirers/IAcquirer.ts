import {
  CreateTransactionDTO,
  CreateTransactionResult,
  SendPayoutInput,
  SendPayoutResult,
  PayoutStatusResult,
  SwapInput,
  SwapResult,
} from "./types";

// 🏦 Interface padrão que todos os adaptadores precisam seguir
export interface IAcquirer {
  createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult>;
  capture?(externalId: string): Promise<any>;

  /**
   * Envia um saque Pix de verdade (irreversível, dinheiro sai na hora).
   * Opcional porque nem toda adquirente processa saque — só quem
   * implementar isso pode ser usada em cashout.service.ts.
   */
  sendPayout?(input: SendPayoutInput): Promise<SendPayoutResult>;

  /** Consulta o status de um saque Pix já enviado (polling de reconciliação). */
  getPayoutStatus?(externalReference: string): Promise<PayoutStatusResult>;

  /**
   * Cota e envia USDT pro endereço do seller (saque em cripto). Cada
   * adapter decide por dentro como cotar+enviar — ver comentário em
   * acquirers/types.ts sobre a diferença de modelo Zendry x Sttart.
   */
  swapToStablecoin?(input: SwapInput): Promise<SwapResult>;
}
