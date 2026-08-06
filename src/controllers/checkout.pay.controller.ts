import { RequestHandler } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import { Checkout, ICheckout } from "../models/checkout.model";
import { Product, IProduct } from "../models/product.model";
import { User } from "../models/user.model";
import { Seller, ISeller } from "../models/seller.model";
import { TransactionService } from "../services/transaction.service";
import { round } from "../utils/fees";
import { DEFAULT_FEE_TABLE } from "../models/feeTable.types";

interface CheckoutContext {
  checkout: ICheckout;
  seller: ISeller;
  product: IProduct;
  bumpProduct: IProduct | null;
  bumpSelected: boolean;
}

type ContextResult = { ok: true; context: CheckoutContext } | { ok: false; status: number; msg: string };

/**
 * Validações e carregamento compartilhados entre payCheckout e
 * authenticateCheckoutCard: checkoutId válido, checkout existe, seller ativo
 * com KYC aprovado, produto disponível, order bump resolvido.
 */
async function resolveCheckoutContext(checkoutId: string | undefined, orderBump: boolean | undefined): Promise<ContextResult> {
  if (!checkoutId) return { ok: false, status: 400, msg: "checkoutId é obrigatório." };
  if (!mongoose.Types.ObjectId.isValid(checkoutId)) return { ok: false, status: 400, msg: "checkoutId inválido." };

  const checkout = await Checkout.findById(checkoutId);
  if (!checkout) return { ok: false, status: 404, msg: "Checkout não encontrado." };

  const user = await User.findById(checkout.userId).lean();
  if (
    !user ||
    (typeof user.status === "boolean" && user.status === false) ||
    (typeof user.status === "string" && user.status.toLowerCase() !== "active")
  ) {
    return { ok: false, status: 403, msg: "Checkout inválido ou usuário inativo." };
  }

  const seller = await Seller.findOne({ userId: checkout.userId });
  if (!seller) return { ok: false, status: 404, msg: "Vendedor não configurado para pagamentos." };

  if (seller.kycStatus !== "approved" && seller.kycStatus !== "active") {
    return {
      ok: false,
      status: 403,
      msg: `❌ Pagamento indisponível: verificação de identidade do vendedor com status '${seller.kycStatus}'.`,
    };
  }

  const product = await Product.findById(checkout.productId);
  if (!product || product.status !== "active") {
    return { ok: false, status: 404, msg: "Produto não encontrado ou indisponível." };
  }

  let bumpProduct: IProduct | null = null;
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

  return { ok: true, context: { checkout, seller, product, bumpProduct, bumpSelected } };
}

/** Valor recalculado no servidor — nunca confiar em total vindo do cliente. */
function computeCheckoutAmount(context: CheckoutContext, discountPct: number): number {
  const base = context.product.price + (context.bumpProduct ? context.bumpProduct.price : 0);
  return round(discountPct > 0 ? base - (base * discountPct) / 100 : base);
}

/**
 * 💳 POST /api/checkout/pay — pagamento REAL do checkout público (comprador sem login).
 *
 * Resolve o seller a partir do checkoutId (não há JWT de comprador), recalcula o
 * valor no servidor e delega pro núcleo real de transação (TransactionService),
 * o mesmo usado pelo dashboard e pela API pública /v1/payments. Pix ou cartão
 * (cartão exige threeds_data já obtido no navegador do comprador — token via
 * GET /api/checkout/zendry-3ds-token, sessão + desafio via
 * ZendrySDKThreeds.init_threeds(), ver docs/guia-cartao.md).
 */
export const payCheckout: RequestHandler = async (req, res) => {
  try {
    const { checkoutId, customer, orderBump, paymentMethod, card, threedsData } = req.body as {
      checkoutId?: string;
      customer?: { name?: string; email?: string; document?: string; phone?: string };
      orderBump?: boolean;
      paymentMethod?: "pix" | "card";
      card?: {
        number?: string;
        holderName?: string;
        expirationDate?: string;
        securityCode?: string;
        installments?: number;
      };
      threedsData?: Record<string, string>;
    };

    if (!customer?.name || !customer?.email || !customer?.document) {
      res.status(400).json({ status: false, msg: "Nome, e-mail e documento do comprador são obrigatórios." });
      return;
    }

    const method = paymentMethod === "card" ? "card" : "pix";

    const result = await resolveCheckoutContext(checkoutId, orderBump);
    if (!result.ok) {
      res.status(result.status).json({ status: false, msg: result.msg });
      return;
    }
    const { context } = result;
    const { checkout, seller, product, bumpProduct, bumpSelected } = context;

    let amount: number;
    if (method === "card") {
      if (!checkout.paymentMethods.creditCard.enabled) {
        res.status(400).json({ status: false, msg: "Cartão indisponível para este checkout." });
        return;
      }
      if (!card?.number || !card.holderName || !card.expirationDate || !card.securityCode || !threedsData) {
        res.status(400).json({ status: false, msg: "Dados do cartão ou da autenticação 3DS incompletos." });
        return;
      }

      const discountedBase = computeCheckoutAmount(context, checkout.paymentMethods.creditCard.discount || 0);

      if (checkout.feeMode === "passOn") {
        // Repassa a taxa da parcela pro comprador — vendedor sempre recebe o
        // valor cheio (mesma estimativa mostrada no preview do checkout,
        // ver utils/installments.ts; o valor real de fee/netAmount ainda é
        // recalculado com a bandeira real depois que a Zendry responde).
        const installments = card.installments || 1;
        const feeTable = seller.feeTable || DEFAULT_FEE_TABLE;
        const feePct = feeTable.cardFees.standard[String(installments)] ?? feeTable.cardFees.standard["1"] ?? 0;
        amount = round(discountedBase / (1 - feePct / 100));
      } else {
        amount = discountedBase;
      }
    } else {
      if (!checkout.paymentMethods.pix.enabled) {
        res.status(400).json({ status: false, msg: "Pix indisponível para este checkout." });
        return;
      }
      amount = computeCheckoutAmount(context, checkout.paymentMethods.pix.discount || 0);
    }

    if (amount <= 0) {
      res.status(400).json({ status: false, msg: "Valor de pagamento inválido." });
      return;
    }

    const document = customer.document.replace(/\D/g, "");

    // 🔁 Idempotência: absorve duplo clique/reload no passo de revisão (janela de 2min)
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(`${checkoutId}:${document}:${bumpSelected}:${method}:${Math.floor(Date.now() / (2 * 60 * 1000))}`)
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
          method: method === "card" ? "credit_card" : "pix",
          productId: String(product._id),
          customer: {
            name: customer.name,
            email: customer.email,
            document,
            phone: customer.phone,
          },
          card:
            method === "card"
              ? {
                  number: card!.number!,
                  holderName: card!.holderName!,
                  expirationDate: card!.expirationDate!,
                  securityCode: card!.securityCode!,
                  installments: card!.installments || 1,
                }
              : undefined,
          // ip_address sempre sobrescrito pelo IP real da requisição — nunca
          // confiar no que o navegador mandar pra esse campo específico.
          threedsData: method === "card" ? { ...threedsData, ip_address: ip } : undefined,
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
        msg: method === "card" ? "Pagamento com cartão processado." : "Pagamento Pix gerado com sucesso.",
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
