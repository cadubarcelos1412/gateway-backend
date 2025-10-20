import { Request, Response } from "express";
import pagarme from "pagarme";
import mongoose, { Types } from "mongoose";
import crypto from "crypto";
import { decodeToken } from "../config/auth";
import { Seller } from "../models/seller.model";
import { Wallet } from "../models/wallet.model";
import { Transaction } from "../models/transaction.model";
import { Product } from "../models/product.model";
import { RetentionPolicy } from "../models/retentionPolicy.model";
import { TransactionAudit } from "../models/transactionAudit.model";
import { calculatePixTax, round } from "../utils/fees";
import { transactionSchema } from "../validation/transaction.schema";

/* -------------------------------------------------------------------------- */
/* 📤 1) Criar transação real                                                 */
/* -------------------------------------------------------------------------- */
export const createTransaction = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 🔑 Autenticação e seller
    const token = req.headers.authorization;
    if (!token) {
      res.status(403).json({ status: false, msg: "Token ausente." });
      return;
    }

    const payload = await decodeToken(token.replace("Bearer ", ""));
    const seller = await Seller.findOne({ userId: payload?.id });
    if (!seller) {
      res.status(403).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    // 🧼 Validação do payload
    const parsed = transactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ status: false, msg: "Payload inválido.", errors: parsed.error.flatten() });
      return;
    }
    const { amount, method, productId, description, customer, idempotencyKey } = parsed.data;

    // 🔁 Idempotência
    if (idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey }).lean();
      if (existing) {
        res.status(200).json({ status: true, msg: "⚠️ Transação já existe.", transaction: existing });
        return;
      }
    }

    // 🔎 Carteira e produto
    const wallet = await Wallet.findOne({ userId: seller.userId });
    if (!wallet) {
      res.status(404).json({ status: false, msg: "Carteira não encontrada." });
      return;
    }

    const product = await Product.findById(productId);
    if (!product) {
      res.status(404).json({ status: false, msg: "Produto não encontrado." });
      return;
    }

    // 🚫 Antifraude – comprador ≠ vendedor
    if (customer.document === seller.documentNumber) {
      res.status(400).json({ status: false, msg: "Comprador não pode ser o mesmo que o vendedor." });
      return;
    }

    // 💰 Taxas e valores
    const fixed = seller?.split?.cashIn?.[method]?.fixed || 0;
    const percentage = seller?.split?.cashIn?.[method]?.percentage || 0;
    const fee = round(calculatePixTax(amount, fixed, percentage));
    const netAmount = round(amount - fee);

    // 🧠 Antifraude
    const forwarded = req.headers["x-forwarded-for"];
    const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : (req.ip || "");

    const riskFlags: string[] = [];
    if (amount > Number(process.env.MAX_TRANSACTION_AMOUNT || 50000)) riskFlags.push("HIGH_AMOUNT");
    if (!ip.startsWith("177.") && !ip.startsWith("201.")) riskFlags.push("FOREIGN_IP");
    if (seller.status !== "active") riskFlags.push("NO_KYC");

    const riskLevel =
      riskFlags.includes("HIGH_AMOUNT") || riskFlags.includes("NO_KYC")
        ? "high"
        : riskFlags.includes("FOREIGN_IP")
        ? "medium"
        : "low";

    // 📊 Política de retenção
    const policy = await RetentionPolicy.findOne({ method, riskLevel, active: true }).lean();
    const retentionPercentage = policy?.percentage || 0;
    const retentionAmount = round(netAmount * (retentionPercentage / 100));
    const releaseDays = policy?.days ?? (method === "pix" ? 0 : method === "boleto" ? 3 : 15);
    const availableIn = new Date(Date.now() + releaseDays * 24 * 60 * 60 * 1000);

    // 🏦 Criação da transação na adquirente
    let pagarmeTransaction: any;
    try {
      console.log("🔑 CHAVE USADA:", process.env.PAGARME_SECRET_KEY);

      // ✅ NÃO DEFINA HOST — a SDK usa o endpoint correto automaticamente
      const client = await pagarme.client.connect({
        api_key: process.env.PAGARME_SECRET_KEY || "",
      });

      pagarmeTransaction = await client.transactions.create({
        amount: Math.round(amount * 100),
        payment_method: method,
        capture: true,
        installments: 1,
        postback_url: `${process.env.BASE_URL}/api/transactions/webhook`,
        customer: {
          external_id: customer.document,
          name: customer.name,
          email: customer.email,
          type: customer.document.length === 11 ? "individual" : "corporation",
          country: "br",
          documents: [
            {
              type: customer.document.length === 11 ? "cpf" : "cnpj",
              number: customer.document,
            },
          ],
        },
      });
    } catch (err: any) {
      console.error("❌ Erro ao criar transação na adquirente:");
      console.error("📡 Status da API:", err?.response?.status || "Sem status");
      console.error("📨 Headers:", JSON.stringify(err?.response?.headers || {}, null, 2));
      console.error("📨 Corpo completo do erro:", JSON.stringify(err?.response?.data || err, null, 2));

      await TransactionAudit.create({
        sellerId: seller._id,
        userId: seller.userId,
        amount,
        method,
        status: "failed",
        kycStatus: seller.status,
        ipAddress: ip,
        buyerDocument: customer.document,
        flags: ["FAILED_ATTEMPT", ...riskFlags],
        description:
          err?.response?.data?.errors?.[0]?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Erro desconhecido",
      });

      throw new Error(
        `Erro ao criar transação: ${
          err?.response?.data?.errors?.[0]?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Erro desconhecido"
        }`
      );
    }

    // 🧾 Registro da transação
    const docs = await Transaction.create(
      [
        {
          userId: seller.userId,
          productId,
          amount,
          fee,
          netAmount,
          retention: retentionAmount,
          type: "deposit",
          method,
          status: "pending",
          description: description || `Venda do produto: ${product.name}`,
          externalId: pagarmeTransaction.id,
          postback: pagarmeTransaction.postback_url,
          riskFlags,
          idempotencyKey: idempotencyKey || null,
          createdAt: new Date(),
          purchaseData: {
            customer,
            products: [{ name: product.name, price: product.price }],
          },
        },
      ],
      { session }
    );

    const tx = docs[0];

    // 💼 Atualização da carteira
    const walletMethod: "pix" | "card" | "bill" | "manual" =
      method === "credit_card" ? "card" : method === "boleto" ? "bill" : "pix";

    wallet.balance.unAvailable.push({
      amount: netAmount - retentionAmount,
      availableIn,
    });

    wallet.log.push({
      transactionId: tx._id as Types.ObjectId,
      type: "topup",
      method: walletMethod,
      amount: netAmount - retentionAmount,
      security: {
        createdAt: new Date(),
        ipAddress: ip,
        userAgent: req.headers["user-agent"] || "unknown",
      },
    });

    product.sales.pending += 1;

    await Promise.all([wallet.save({ session }), product.save({ session })]);
    await session.commitTransaction();

    // 📊 Auditoria de sucesso
    await TransactionAudit.create({
      transactionId: tx._id,
      sellerId: seller._id,
      userId: seller.userId,
      amount,
      method,
      status: "pending",
      kycStatus: seller.status,
      ipAddress: ip,
      buyerDocument: customer.document,
      flags: riskFlags,
      description: "Transação criada e aguardando aprovação.",
    });

    res.status(201).json({
      status: true,
      msg: "✅ Transação criada com sucesso. Aguardando aprovação da adquirente.",
      transaction: tx,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Erro em createTransaction:", error);
    res.status(500).json({ status: false, msg: (error as Error).message });
  } finally {
    session.endSession();
  }
};

/* -------------------------------------------------------------------------- */
/* 🔎 2) Consultar transação por ID                                           */
/* -------------------------------------------------------------------------- */
export const consultTransactionByID = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.query;
    if (!id || typeof id !== "string") {
      res.status(400).json({ status: false, msg: "ID da transação é obrigatório." });
      return;
    }

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      res.status(404).json({ status: false, msg: "Transação não encontrada." });
      return;
    }

    res.status(200).json(transaction);
  } catch (error) {
    console.error("❌ Erro em consultTransactionByID:", error);
    res.status(500).json({ status: false, msg: "Erro ao consultar transação." });
  }
};

/* -------------------------------------------------------------------------- */
/* 🔁 3) Webhook seguro – valida assinatura e atualiza status                 */
/* -------------------------------------------------------------------------- */
export const webhookTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { externalCode, status } = req.body;
    const signature = req.headers["x-hub-signature"] as string;
    const secret = process.env.INTERNAL_WEBHOOK_SECRET || "";

    const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
    if (signature !== expected) {
      res.status(403).json({ status: false, msg: "Assinatura inválida." });
      return;
    }

    const transaction = await Transaction.findOne({ externalId: externalCode });
    if (!transaction) {
      res.status(404).json({ status: false, msg: "Transação não encontrada." });
      return;
    }

    transaction.status = ["pending", "approved", "failed"].includes(status) ? status : "pending";
    await transaction.save();

    res.status(200).json({ status: true, msg: "✅ Status atualizado com sucesso.", transaction });
  } catch (error) {
    console.error("❌ Erro em webhookTransaction:", error);
    res.status(500).json({ status: false, msg: "Erro ao processar webhook." });
  }
};
