import { CreateTransactionDTO, CreateTransactionResult } from "./types";

export interface IAcquirer {
  createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult>;
}
