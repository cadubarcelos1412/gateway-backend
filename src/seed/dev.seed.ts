import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/user.model";
import { Wallet } from "../models/wallet.model";
import { Seller } from "../models/seller.model";
import { Product } from "../models/product.model";
import { Transaction } from "../models/transaction.model";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gateway-db";

const DEV_PASSWORD = "PyxGate123";
const MASTER_EMAIL = "admin@pyxgate.com";
const SELLER_EMAIL = "seller@pyxgate.com";

const seedDev = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado ao MongoDB");

    await Promise.all([
      User.deleteMany({ email: { $in: [MASTER_EMAIL, SELLER_EMAIL, "master@kissa.dev", "seller@kissa.dev"] } }),
      Seller.deleteMany({ email: { $in: [SELLER_EMAIL, "seller@kissa.dev"] } }),
    ]);

    const hashedPassword = await bcrypt.hash(DEV_PASSWORD, 10);

    const master = await User.create({
      name: "Master Admin",
      email: MASTER_EMAIL,
      password: hashedPassword,
      role: "master",
      status: "active",
      document: "00000000000",
    });

    const seller = await User.create({
      name: "Seller Demo",
      email: SELLER_EMAIL,
      password: hashedPassword,
      role: "seller",
      status: "active",
      document: "11111111111",
      split: {
        cashIn: {
          pix: { fixed: 0, percentage: 2.99 },
          creditCard: { fixed: 0.4, percentage: 3.49 },
          boleto: { fixed: 2.5, percentage: 2.99 },
        },
      },
    });

    await Wallet.deleteMany({ userId: seller._id });
    await Wallet.create({
      userId: seller._id,
      balance: { available: 15420.5, unAvailable: [] },
      log: [],
    });

    await Seller.create({
      userId: seller._id,
      name: seller.name,
      email: seller.email,
      phone: "11999998888",
      type: "PF",
      documentNumber: seller.document,
      address: {
        street: "Rua Demo",
        number: "100",
        district: "Centro",
        city: "São Paulo",
        state: "SP",
        country: "BR",
        postalCode: "01000000",
      },
      acquirer: "zendry",
      kycStatus: "approved",
      status: "active",
    });

    await Product.deleteMany({ userId: seller._id });
    const products = await Product.insertMany([
      {
        userId: seller._id,
        name: "Curso de Marketing Digital",
        description: "Curso completo em vídeo-aulas",
        price: 197,
        status: "active",
        category: "infoproduto",
        sales: { approved: 12, pending: 2, refused: 1 },
      },
      {
        userId: seller._id,
        name: "Mentoria 1:1",
        description: "Sessão de mentoria individual",
        price: 497,
        status: "active",
        category: "servico",
        sales: { approved: 3, pending: 0, refused: 0 },
      },
    ]);

    await Transaction.deleteMany({ userId: seller._id });
    await Transaction.insertMany([
      {
        userId: seller._id,
        productId: products[0]._id,
        amount: 197,
        fee: 5.89,
        netAmount: 191.11,
        retention: 0,
        type: "deposit",
        method: "pix",
        status: "approved",
        purchaseData: {
          customer: { name: "Cliente Um", email: "cliente1@example.com" },
          products: [{ name: products[0].name, price: 197 }],
        },
      },
      {
        userId: seller._id,
        productId: products[1]._id,
        amount: 497,
        fee: 17.35,
        netAmount: 479.65,
        retention: 0,
        type: "deposit",
        method: "credit_card",
        status: "pending",
        purchaseData: {
          customer: { name: "Cliente Dois", email: "cliente2@example.com" },
          products: [{ name: products[1].name, price: 497 }],
        },
      },
    ]);

    console.log("✅ Seed de desenvolvimento criado com sucesso!");
    console.log(`   Master: ${MASTER_EMAIL} / ${DEV_PASSWORD}`);
    console.log(`   Seller: ${SELLER_EMAIL} / ${DEV_PASSWORD}`);
    console.log(`   Master ID: ${master._id}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro ao executar seed de dev:", err);
    process.exit(1);
  }
};

seedDev();
