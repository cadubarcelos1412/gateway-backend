// scripts/createMasterUser.ts
import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../src/models/user.model";

(async () => {
  try {
    // ✅ Conecta ao MongoDB
    const uri = process.env.MONGO_URI as string;
    if (!uri) {
      console.error("❌ Variável MONGO_URI ausente no .env");
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log("📡 Conectado ao MongoDB");

    // 📌 Dados do usuário master
    const masterData = {
      name: "Master Admin",
      email: "cadu@kissapay.com", // 👈 Corrigido para o domínio real
      password: "SenhaForte123!", // 🔥 Senha em texto puro (será criptografada pelo backend)
      role: "master",
      status: "active",
      document: "33314665814",
    };

    // 🔍 Verifica se já existe um master
    const exists = await User.findOne({ role: "master" });
    if (exists) {
      console.log("⚠️ Já existe um usuário master no banco:");
      console.log(`📧 Email: ${exists.email}`);
      console.log(`🆔 ID: ${exists._id}`);
      console.log(`🔒 Status: ${exists.status}`);
      process.exit(0);
    }

    // 👑 Cria o master
    const masterUser = await User.create(masterData);

    console.log("\n✅ Usuário MASTER criado com sucesso!");
    console.log(`📧 Email: ${masterUser.email}`);
    console.log(`🆔 ID: ${masterUser._id}`);
    console.log(`🔑 Senha: ${masterData.password}`);
    console.log("💡 Faça login pelo front em /login com essas credenciais.\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao criar usuário master:", error);
    process.exit(1);
  }
})();
