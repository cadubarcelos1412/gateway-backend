"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionService = void 0;
const auth_1 = require("../config/auth");
const user_model_1 = require("../models/user.model");
const product_model_1 = require("../models/product.model");
const transaction_model_1 = require("../models/transaction.model");
const ledger_service_1 = require("./ledger/ledger.service");
const ledger_accounts_1 = require("../config/ledger-accounts");
const fees_1 = require("../utils/fees");
/* -------------------------------------------------------------------------- */
/* 💳 TransactionService – Criação de transações com reserva técnica           */
/* -------------------------------------------------------------------------- */
class TransactionService {
    /**
     * Cria uma transação e registra lançamentos contábeis com reserva_risco.
     */
    static async createTransaction(req, session) {
        const token = req.headers.authorization;
        if (!token) {
            throw new Error("Token ausente.");
        }
        const payload = await (0, auth_1.decodeToken)(token.replace("Bearer ", ""));
        const seller = await user_model_1.User.findById(payload?.id);
        if (!seller) {
            throw new Error("Vendedor não encontrado.");
        }
        const { productId, amount, method, description } = req.body;
        if (!productId || !amount) {
            throw new Error("Produto e valor são obrigatórios.");
        }
        const product = await product_model_1.Product.findById(productId);
        if (!product) {
            throw new Error("Produto não encontrado.");
        }
        // 🧮 Reserva de risco (5%)
        const riskReserve = (0, ledger_service_1.calculateRiskReserve)(amount, 0.05);
        const netAmount = (0, fees_1.round)(amount - riskReserve);
        // 💾 Cria transação
        const [transaction] = await transaction_model_1.Transaction.create([
            {
                userId: seller._id,
                productId: product._id,
                amount,
                netAmount,
                fee: 0,
                method,
                status: "approved",
                description: description || `Venda de ${product.name}`,
            },
        ], { session });
        // 🔒 Garante que os IDs sejam strings
        const transactionId = transaction._id.toString();
        const sellerId = seller._id.toString();
        // 🧾 Lançamentos contábeis (dupla entrada)
        await (0, ledger_service_1.postLedgerEntries)([
            // Crédito para o seller (valor líquido)
            { account: ledger_accounts_1.LEDGER_ACCOUNTS.PASSIVO_SELLER, type: "credit", amount: netAmount },
            // Reserva técnica de 5%
            { account: ledger_accounts_1.LEDGER_ACCOUNTS.RESERVA_RISCO, type: "credit", amount: riskReserve },
            // Débito no caixa principal (valor total da venda)
            { account: ledger_accounts_1.LEDGER_ACCOUNTS.CONTA_CORRENTE, type: "debit", amount },
        ], {
            idempotencyKey: `tx:${transactionId}`,
            transactionId,
            sellerId,
            source: { system: "transactions", acquirer: "pagarme" },
        });
        return {
            transaction,
            acquirer: "pagarme",
            reservaRisco: riskReserve,
            liquidoSeller: netAmount,
        };
    }
}
exports.TransactionService = TransactionService;
