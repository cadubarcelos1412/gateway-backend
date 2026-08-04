import { RequestHandler } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import { Checkout } from "../models/checkout.model";
import { Product } from "../models/product.model";
import { User } from "../models/user.model";
import { Seller } from "../models/seller.model";
import { TransactionService } from "../services/transaction.service";
import { round } from "../utils/fees";

/**
 * 💳 POST /api/checkout/pay — pagamento REAL do checkout público (comprador sem login).
 *
 * Resolve o seller a partir do checkoutId (não há JWT de comprador), recalcula o
 * valor no servidor e delega pro núcleo real de transação (TransactionService),
 * o mesmo usado pelo dashboard e pela API pública /v1/payments. Só Pix nesta fase
 * — cartão exige 3DS real, ainda não implementado (ver docs/guia-cartao.md).
 */
export const payCheckout: RequestHandler = async (req, res) => {
  try {
    const { checkoutId, customer, orderBump } = req.body as {
      checkoutId?: string;
      customer?: { name?: string; email?: string; document?: string; phone?: string };
      orderBump?: boolean;
    };

    if (!checkoutId) {
      res.status(400).json({ status: false, msg: "checkoutId é obrigatório." });
      return;
    }
    if (!customer?.name || !customer?.email || !customer?.document) {
      res.status(400).json({ status: false, msg: "Nome, e-mail e documento do comprador são obrigatórios." });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(checkoutId)) {
      res.status(400).json({ status: false, msg: "checkoutId inválido." });
      return;
    }

    const checkout = await Checkout.findById(checkoutId);
    if (!checkout) {
      res.status(404).json({ status: false, msg: "Checkout não encontrado." });
      return;
    }

    const user = await User.findById(checkout.userId).lean();
    if (
      !user ||
      (typeof user.status === "boolean" && user.status === false) ||
      (typeof user.status === "string" && user.status.toLowerCase() !== "active")
    ) {
      res.status(403).json({ status: false, msg: "Checkout inválido ou usuário inativo." });
      return;
    }

    const seller = await Seller.findOne({ userId: checkout.userId });
    if (!seller) {
      res.status(404).json({ status: false, msg: "Vendedor não configurado para pagamentos." });
      return;
    }

    if (seller.kycStatus !== "approved" && seller.kycStatus !== "active") {
      res.status(403).json({
        status: false,
        msg: `❌ Pagamento indisponível: verificação de identidade do vendedor com status '${seller.kycStatus}'.`,
      });
      return;
    }

    const product = await Product.findById(checkout.productId);
    if (!product || product.status !== "active") {
      res.status(404).json({ status: false, msg: "Produto não encontrado ou indisponível." });
      return;
    }

    if (!checkout.paymentMethods.pix.enabled) {
      res.status(400).json({ status: false, msg: "Pix indisponível para este checkout." });
      return;
    }

    // ➕ Order bump — só considera se o checkout de fato tiver bump configurado
    let bumpProduct = null;
    const bumpSelected = Boolean(
      orderBump &&
      checkout.orderBump.status &&
      checkout.orderBump.productId &&
      mongoose.Types.ObjectId.isValid(checkout.orderBump.productId)
    );
    if (bumpSelected) {
      const candidate = await Product.findById(checkout.orderBump.productId);
      if (candidate && String(candidate.userId) === String(checkout.userId)) {
        bumpProduct = candidate;
      }
    }

    // 💰 Valor recalculado no servidor — nunca confiar em total vindo do cliente
    const base = product.price + (bumpProduct ? bumpProduct.price : 0);
    const discountPct = checkout.paymentMethods.pix.discount || 0;
    const amount = round(discountPct > 0 ? base - (base * discountPct) / 100 : base);

    if (amount <= 0) {
      res.status(400).json({ status: false, msg: "Valor de pagamento inválido." });
      return;
    }

    const document = customer.document.replace(/\D/g, "");

    // 🔁 Idempotência: absorve duplo clique/reload no passo de revisão (janela de 2min)
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(`${checkoutId}:${document}:${bumpSelected}:${Math.floor(Date.now() / (2 * 60 * 1000))}`)
      .digest("hex");

    const ip = req.ip || "0.0.0.0";
    const userAgent = (req.headers["user-agent"] as string) || "unknown";

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { transaction } = await TransactionService.createTransactionCore({
        seller,
        session,
        input: {
          amount,
          method: "pix",
          productId: String(product._id),
          customer: {
            name: customer.name,
            email: customer.email,
            document,
            phone: customer.phone,
          },
          idempotencyKey,
          metadata: { checkoutId, orderBump: bumpSelected, source: "public_checkout" },
        },
        ip,
        userAgent,
        mode: "live",
      });
      await session.commitTransaction();

      res.status(201).json({
        status: true,
        msg: "Pagamento Pix gerado com sucesso.",
        transaction,
        pix: transaction.paymentDetails?.pixCode || null,
      });
    } catch (error) {
      await session.abortTransaction();
      console.error("❌ Erro em payCheckout:", error);
      res.status(400).json({
        status: false,
        msg: (error as Error).message || "Erro ao processar pagamento.",
      });
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("❌ Erro em payCheckout:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao processar pagamento." });
  }
};
