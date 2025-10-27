import bcrypt from "bcrypt";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/user.model";

dotenv.config();

async function createMasterUser() {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("❌ MONGO_URI não encontrado no .env");

    await mongoose.connect(uri);
    console.log("✅ Conectado ao MongoDB");

    const hashedPassword = await bcrypt.hash("SenhaForte123!", 10);

    const user = await User.create({
      name: "Master Admin",
      email: "cadu@kissapay.com",
      password: hashedPassword,
      role: "master",
      status: "active",
      document: "33314665814",
      split: {
        cashIn: {
          pix: { fixed: 0, percentage: 0 },
          creditCard: { fixed: 0, percentage: 0 },
          boleto: { fixed: 0, percentage: 0 },
        },
      },
    });

    console.log("🔥 Usuário master criado com sucesso!");
    console.log("📄 ID:", user._id);
  } catch (err) {
    console.error("❌ Erro ao criar usuário:", err);
  } finally {
    process.exit();
  }
}

createMasterUser();
