// scripts/createMasterUser.ts
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../src/models/user.model";

(async () => {
  try {
    // ✅ Conecta ao MongoDB
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log("📡 Conectado ao MongoDB");

    // 📌 Dados do usuário master
    const masterData = {
      name: "Master Admin",
      email: "cadu@gkissapay.com",
      password: await bcrypt.hash("SenhaForte123!", 10),
      role: "master",
      status: "active",
      document: "33314665814", // ✅ Adicionamos CPF genérico (ajuste se quiser)
    };

    // 🔍 Verifica se já existe um master
    const exists = await User.findOne({ role: "master" });
    if (exists) {
      console.log("⚠️ Já existe um usuário master:");
      console.log(`📧 Email: ${exists.email}`);
      console.log(`🆔 ID: ${exists._id}`);
      process.exit(0);
    }

    // 👑 Cria o master
    const masterUser = await User.create(masterData);
    console.log("\n✅ Usuário MASTER criado com sucesso!");
    console.log(`📧 Email: ${masterUser.email}`);
    console.log(`🆔 ID: ${masterUser._id}`);
    console.log("🔑 Use esse ID para gerar tokens master.\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao criar usuário master:", error);
    process.exit(1);
  }
})();
