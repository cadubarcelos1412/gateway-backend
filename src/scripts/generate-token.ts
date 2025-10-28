import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const userId = "68f131eb52d8f49bcaab5a6f"; // ID do usuário vinculado ao seller
const role = "seller";

// 🚨 Verificações básicas
if (!process.env.SECRET_TOKEN) {
  console.error("❌ ERRO: SECRET_TOKEN não encontrado no .env");
  process.exit(1);
}
if (!process.env.ISSUER) {
  console.error("❌ ERRO: ISSUER não encontrado no .env");
  process.exit(1);
}

try {
  const token = jwt.sign(
    {
      id: userId,
      role,
    },
    process.env.SECRET_TOKEN as string,
    {
      expiresIn: "24h",
      issuer: process.env.ISSUER,
    }
  );

  console.log("\n✅ Token gerado com sucesso!");
  console.log("\nBearer " + token + "\n");
} catch (err) {
  console.error("❌ Erro ao gerar o token:", err);
}
