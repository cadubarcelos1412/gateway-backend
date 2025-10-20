import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function fixIndexes() {
  try {
    console.log("🔄 Conectando ao MongoDB...");
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log("✅ Conectado ao banco com sucesso!");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("❌ Conexão com o banco não foi inicializada corretamente.");
    }

    const collection = db.collection("retentionpolicies");

    console.log("📋 Índices atuais:");
    const indexes = await collection.indexes();
    console.log(indexes);

    // 🔥 Verifica se existe o índice errado "method_1" e apaga
    const hasWrongIndex = indexes.find((idx) => idx.name === "method_1");
    if (hasWrongIndex) {
      console.log("⚠️ Índice errado encontrado. Removendo...");
      await collection.dropIndex("method_1");
      console.log("✅ Índice method_1 removido com sucesso!");
    } else {
      console.log("✅ Nenhum índice errado encontrado.");
    }

    // ✅ Garante que o índice certo está criado
    await collection.createIndex({ method: 1, riskLevel: 1 }, { unique: true });
    console.log("✅ Índice correto { method + riskLevel } criado!");

    console.log("🎉 Corrigido com sucesso. Pode testar o POST de novo!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro ao corrigir índices:", err);
    process.exit(1);
  }
}

fixIndexes();
