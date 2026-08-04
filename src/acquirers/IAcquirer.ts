import { CreateTransactionDTO, CreateTransactionResult } from "./types";

// 🏦 Interface padrão que todos os adaptadores precisam seguir
export interface IAcquirer {
  createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult>;
  capture?(externalId: string): Promise<any>;
  refund?(externalId: string, amountInCents?: number): Promise<any>;
}
