import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../src/models/user.model";

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log("📡 Conectado ao MongoDB");

    const masterData = {
      name: "Master Admin",
      email: "cadu@kissapay.com", // ✅ Corrigido
      password: "SenhaForte123!", // ✅ Em texto puro
      role: "master",
      status: "active",
      document: "33314665814",
    };

    const exists = await User.findOne({ role: "master" });
    if (exists) {
      console.log("⚠️ Já existe um usuário master no banco.");
      console.log(`📧 Email: ${exists.email}`);
      console.log(`🆔 ID: ${exists._id}`);
      process.exit(0);
    }

    const masterUser = await User.create(masterData);
    console.log("\n✅ Usuário MASTER criado com sucesso!");
    console.log(`📧 Email: ${masterUser.email}`);
    console.log(`🆔 ID: ${masterUser._id}`);
    console.log("🔑 Senha: SenhaForte123!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao criar usuário master:", error);
    process.exit(1);
  }
})();
