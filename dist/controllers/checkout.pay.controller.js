"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payCheckout = void 0;
const checkout_model_1 = require("../models/checkout.model");
const product_model_1 = require("../models/product.model");
const transaction_model_1 = require("../models/transaction.model");
const wallet_model_1 = require("../models/wallet.model");
const user_model_1 = require("../models/user.model");
const fees_1 = require("../utils/fees");
const payCheckout = async (req, res) => {
    try {
        const { checkoutId } = req.body;
        if (!checkoutId) {
            res.status(400).json({ status: false, msg: "checkoutId é obrigatório." });
            return;
        }
        const checkout = await checkout_model_1.Checkout.findById(checkoutId).lean();
        if (!checkout) {
            res.status(404).json({ status: false, msg: "Checkout não encontrado." });
            return;
        }
        const product = await product_model_1.Product.findById(checkout.productId).lean();
        const seller = await user_model_1.User.findById(checkout.userId).lean();
        if (!product || !seller) {
            res.status(404).json({ status: false, msg: "Produto ou vendedor não encontrado." });
            return;
        }
        let wallet = await wallet_model_1.Wallet.findOne({ userId: seller._id });
        if (!wallet) {
            wallet = new wallet_model_1.Wallet({ userId: seller._id, balance: { available: 0, unAvailable: [] } });
        }
        const amount = product.price;
        // ✅ Evita erro de "possibly undefined"
        const fixed = seller.split?.cashIn?.pix?.fixed ?? 0;
        const percentage = seller.split?.cashIn?.pix?.percentage ?? 0;
        const tax = (0, fees_1.calculatePixTax)(amount, fixed, percentage);
        const netAmount = (0, fees_1.round)(amount - tax);
        const transaction = new transaction_model_1.Transaction({
            userId: seller._id,
            amount,
            tax,
            netAmount,
            type: "deposit",
            method: "pix",
            status: "completed", // ✅ garantido como enum válido
            postback: "",
            createdAt: new Date(),
            purchaseData: {
                customer: {
                    name: "Cliente Simulado",
                    email: "cliente@email.com",
                    phone: "",
                    address: "",
                    ip: req.ip || "0.0.0.0",
                    document: "",
                },
                products: [
                    {
                        name: product.name,
                        price: product.price,
                    },
                ],
            },
        });
        await transaction.save();
        wallet.balance.unAvailable.push({
            amount: netAmount,
            availableIn: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        });
        await wallet.save();
        res.status(201).json({
            status: true,
            msg: "Pagamento simulado com sucesso.",
            transaction,
            saldo: {
                disponivel: wallet.balance.available,
                indisponivel: wallet.balance.unAvailable.reduce((acc, el) => acc + el.amount, 0),
            },
        });
    }
    catch (error) {
        console.error("❌ Erro em payCheckout:", error);
        res.status(500).json({ status: false, msg: "Erro ao simular pagamento." });
    }
};
exports.payCheckout = payCheckout;
