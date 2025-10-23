import { Request } from "express";
import mongoose, { Types, ClientSession } from "mongoose";
import { decodeToken } from "../config/auth";
import { User } from "../models/user.model";
import { Product } from "../models/product.model";
import { Transaction, ITransaction } from "../models/transaction.model";
import { postLedgerEntries, calculateRiskReserve } from "./ledger/ledger.service";
import { LEDGER_ACCOUNTS } from "../config/ledger-accounts";
import { round } from "../utils/fees";

/* -------------------------------------------------------------------------- */
/* 💳 TransactionService – Criação de transações com reserva técnica           */
/* -------------------------------------------------------------------------- */

export class TransactionService {
  /**
   * Cria uma transação e registra lançamentos contábeis com reserva_risco.
   */
  static async createTransaction(req: Request, session?: ClientSession) {
    const token = req.headers.authorization;
    if (!token) {
      throw new Error("Token ausente.");
    }

    const payload = await decodeToken(token.replace("Bearer ", ""));
    const seller = await User.findById(payload?.id);
    if (!seller) {
      throw new Error("Vendedor não encontrado.");
    }

    const { productId, amount, method, description } = req.body;
    if (!productId || !amount) {
      throw new Error("Produto e valor são obrigatórios.");
    }

    const product = await Product.findById(productId);
    if (!product) {
      throw new Error("Produto não encontrado.");
    }

    // 🧮 Reserva de risco (5%)
    const riskReserve = calculateRiskReserve(amount, 0.05);
    const netAmount = round(amount - riskReserve);

    // 💾 Cria transação
    const [transaction]: ITransaction[] = await Transaction.create(
      [
        {
          userId: seller._id as Types.ObjectId,
          productId: product._id as Types.ObjectId,
          amount,
          netAmount,
          fee: 0,
          method,
          status: "approved",
          description: description || `Venda de ${product.name}`,
        },
      ],
      { session }
    );

    // 🔒 Garante que os IDs sejam strings
    const transactionId = (transaction._id as Types.ObjectId).toString();
    const sellerId = (seller._id as Types.ObjectId).toString();

    // 🧾 Lançamentos contábeis (dupla entrada)
    await postLedgerEntries(
      [
        // Crédito para o seller (valor líquido)
        { account: LEDGER_ACCOUNTS.PASSIVO_SELLER, type: "credit", amount: netAmount },
        // Reserva técnica de 5%
        { account: LEDGER_ACCOUNTS.RESERVA_RISCO, type: "credit", amount: riskReserve },
        // Débito no caixa principal (valor total da venda)
        { account: LEDGER_ACCOUNTS.CONTA_CORRENTE, type: "debit", amount },
      ],
      {
        idempotencyKey: `tx:${transactionId}`,
        transactionId,
        sellerId,
        source: { system: "transactions", acquirer: "pagarme" },
      }
    );

    return {
      transaction,
      acquirer: "pagarme",
      reservaRisco: riskReserve,
      liquidoSeller: netAmount,
    };
  }
}
