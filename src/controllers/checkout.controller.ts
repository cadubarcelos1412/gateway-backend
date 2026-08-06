import { Request, Response } from "express";
import mongoose from "mongoose";
import { decodeToken } from "../config/auth";
import { User } from "../models/user.model";
import { Product } from "../models/product.model";
import { Checkout } from "../models/checkout.model";
import { Seller } from "../models/seller.model";
import { getZendryAccessToken } from "../lib/zendry/client";
import { generateSlug } from "../utils/slug";
import { computeInstallmentOptions } from "../utils/installments";
import { DEFAULT_FEE_TABLE } from "../models/feeTable.types";

/* 🔑 Utilitário: pegar usuário pelo token */
const getUserFromToken = async (token?: string) => {
  if (!token) return null;
  const payload = await decodeToken(token.replace("Bearer ", ""));
  if (!payload?.id) return null;
  return await User.findById(payload.id).lean();
};

/* 🛒 Criar novo checkout */
export const createCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { productId, productName, settings } = req.body;

    // ✅ Valida campos obrigatórios
    if (!productId && !productName) {
      res.status(400).json({ status: false, msg: "Informe o ID ou o nome do produto." });
      return;
    }

    // 🔍 Busca o produto por ID ou nome
    const productQuery: any = { userId: user._id };
    if (productId) {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        res.status(400).json({ status: false, msg: "ID de produto inválido." });
        return;
      }
      productQuery._id = new mongoose.Types.ObjectId(productId);
    }
    if (productName) productQuery.name = productName;

    const product = await Product.findOne(productQuery).lean();
    if (!product) {
      res.status(404).json({ status: false, msg: "Produto não encontrado." });
      return;
    }

    // 🏗️ Cria o checkout
    const checkout = new Checkout({
      userId: user._id,
      productId: product._id,
      settings: {
        logoUrl: "",
        bannerUrl: "",
        redirectUrl: "/",
        validateDocument: false,
        needAddress: false,
        headCode: settings?.headCode || "",
        bodyCode: settings?.bodyCode || "",
      },
      paymentMethods: {
        creditCard: { enabled: true, discount: 0 },
        pix: { enabled: true, discount: 0 },
        boleto: { enabled: true, expirationDays: 3, discount: 0 },
      },
      whatsappButton: { status: false, number: "" },
      countdownTimer: { status: false, title: "", time: 0 },
      orderBump: { status: false, productId: "" },
      testimonials: { status: false, reviews: [] },
      background: "white",
      colors: "#00D084",
    });

    const savedCheckout = await checkout.save();

    res.status(201).json({
      status: true,
      msg: "Checkout criado com sucesso.",
      checkoutId: String(savedCheckout._id),
      product: { id: String(product._id), name: product.name },
    });
  } catch (error) {
    console.error("❌ Erro em createCheckout:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao criar checkout." });
  }
};

/**
 * 🔗 POST /api/checkout/quick-link
 * Cria Produto + Checkout numa chamada só, com um slug curto pra URL
 * pública (pyxgate.com/#/p/<slug>) — pensado pra gerar um link de
 * pagamento em segundos, sem passar pelo builder completo.
 */
export const createQuickPaymentLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { name, price, methods, feeMode } = req.body as {
      name?: string;
      price?: number;
      methods?: { pix?: boolean; card?: boolean };
      feeMode?: "absorb" | "passOn";
    };

    if (!name || typeof price !== "number" || price <= 0) {
      res.status(400).json({ status: false, msg: "Informe o nome e o preço do produto (maior que zero)." });
      return;
    }

    const pixEnabled = methods?.pix !== false; // default true
    const cardEnabled = methods?.card === true; // default false — cartão é opt-in (exige 3DS)
    if (!pixEnabled && !cardEnabled) {
      res.status(400).json({ status: false, msg: "Escolha pelo menos uma forma de pagamento." });
      return;
    }

    const resolvedFeeMode: "absorb" | "passOn" = feeMode === "passOn" ? "passOn" : "absorb";

    const product = await Product.create({
      userId: user._id,
      name,
      price,
    });

    let slug = generateSlug();
    // Colisão é extremamente improvável (alfabeto de 56 chars ^ 7), mas
    // trata mesmo assim em vez de confiar cegamente.
    for (let attempt = 0; attempt < 5 && (await Checkout.exists({ slug })); attempt++) {
      slug = generateSlug();
    }

    const checkout = await Checkout.create({
      userId: user._id,
      productId: product._id,
      slug,
      feeMode: resolvedFeeMode,
      settings: {
        logoUrl: "",
        bannerUrl: "",
        redirectUrl: "/",
        validateDocument: false,
        needAddress: false,
        headCode: "",
        bodyCode: "",
      },
      paymentMethods: {
        creditCard: { enabled: cardEnabled, discount: 0 },
        pix: { enabled: pixEnabled, discount: 0 },
        boleto: { enabled: false, expirationDays: 3, discount: 0 },
      },
    });

    let installmentPreview: ReturnType<typeof computeInstallmentOptions> = [];
    if (cardEnabled) {
      const seller = await Seller.findOne({ userId: user._id }).lean();
      installmentPreview = computeInstallmentOptions(price, resolvedFeeMode, seller?.feeTable || DEFAULT_FEE_TABLE);
    }

    res.status(201).json({
      status: true,
      msg: "Link de pagamento criado com sucesso.",
      slug,
      checkoutId: String(checkout._id),
      product: { id: String(product._id), name: product.name, price: product.price },
      feeMode: resolvedFeeMode,
      installmentPreview,
    });
  } catch (error) {
    console.error("❌ Erro em createQuickPaymentLink:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao criar link de pagamento." });
  }
};

/* 🌐 Obter checkout público — por ID (link antigo) ou slug (link rápido) */
export const getPublicCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, slug } = req.query;

    let checkout;
    if (typeof slug === "string" && slug.trim()) {
      checkout = await Checkout.findOne({ slug: slug.trim() }).lean();
    } else if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      checkout = await Checkout.findById(new mongoose.Types.ObjectId(id)).lean();
    } else {
      res.status(400).json({ status: false, msg: "Informe um id ou slug de checkout válido." });
      return;
    }

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

    const product = await Product.findById(checkout.productId).lean();

    let installmentPreview: ReturnType<typeof computeInstallmentOptions> = [];
    if (product && checkout.paymentMethods.creditCard.enabled) {
      const seller = await Seller.findOne({ userId: checkout.userId }).lean();
      installmentPreview = computeInstallmentOptions(
        product.price,
        checkout.feeMode || "absorb",
        seller?.feeTable || DEFAULT_FEE_TABLE
      );
    }

    res.status(200).json({ status: true, checkout, product, installmentPreview });
  } catch (error) {
    console.error("❌ Erro em getPublicCheckout:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao consultar checkout." });
  }
};

/* 🔐 Obter checkout do usuário autenticado */
export const getCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { id } = req.query;
    if (!id || typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID do checkout inválido." });
      return;
    }

    const checkout = await Checkout.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: user._id,
    }).lean();

    if (!checkout) {
      res.status(404).json({ status: false, msg: "Checkout não encontrado." });
      return;
    }

    res.status(200).json({ status: true, checkout });
  } catch (error) {
    console.error("❌ Erro em getCheckout:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar checkout." });
  }
};

/* ❌ Deletar checkout */
export const deleteCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { id } = req.body;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID do checkout inválido." });
      return;
    }

    const result = await Checkout.deleteOne({ _id: new mongoose.Types.ObjectId(id), userId: user._id });
    if (result.deletedCount === 0) {
      res.status(404).json({ status: false, msg: "Checkout não encontrado." });
      return;
    }

    res.status(200).json({ status: true, msg: "Checkout deletado com sucesso." });
  } catch (error) {
    console.error("❌ Erro em deleteCheckout:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao deletar checkout." });
  }
};

/* 🔐 Token da Zendry pro SDK de 3DS (roda no navegador do comprador) */
export const getZendryThreedsToken = async (_req: Request, res: Response): Promise<void> => {
  try {
    const token = await getZendryAccessToken();
    res.status(200).json({ token });
  } catch (error) {
    console.error("❌ Erro ao obter token 3DS da Zendry:", error);
    res.status(502).json({ status: false, msg: "Erro ao obter token do gateway de pagamento." });
  }
};

/* 🔄 Atualizar checkout */
export const updateCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { _id, ...updates } = req.body;
    if (!_id || !mongoose.Types.ObjectId.isValid(_id)) {
      res.status(400).json({ status: false, msg: "ID do checkout inválido." });
      return;
    }

    const checkout = await Checkout.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(_id), userId: user._id },
      { $set: updates },
      { new: true, runValidators: true, lean: true }
    );

    if (!checkout) {
      res.status(404).json({ status: false, msg: "Checkout não encontrado." });
      return;
    }

    res.status(200).json({ status: true, msg: "Checkout atualizado com sucesso.", checkout });
  } catch (error) {
    console.error("❌ Erro em updateCheckout:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar checkout." });
  }
};