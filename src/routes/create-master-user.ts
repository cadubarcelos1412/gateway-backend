import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { User } from "../models/user.model";

async function createMasterUser() {
  try {
    await mongoose.connect("mongodb+srv://SEU_USUARIO:SENHA@SEU_CLUSTER.mongodb.net/gateway-db?retryWrites=true&w=majority");

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

    console.log("✅ Usuário master criado com sucesso!");
    console.log("📄 ID:", user._id);
  } catch (err) {
    console.error("❌ Erro ao criar usuário:", err);
  } finally {
    process.exit();
  }
}

createMasterUser();
