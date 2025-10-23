// src/acquirers/IAcquirer.ts
import { CreateTransactionDTO, CreateTransactionResult } from "./types";

/**
 * 🧩 Interface base de adquirentes
 * Garante que todos os adapters (Pagar.me, Stripe, etc.)
 * tenham a mesma assinatura pública.
 */
export interface IAcquirer {
  createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult>;
}
