"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
dotenv_1.default.config();
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
    const token = jsonwebtoken_1.default.sign({
        id: userId,
        role,
    }, process.env.SECRET_TOKEN, {
        expiresIn: "24h",
        issuer: process.env.ISSUER,
    });
    console.log("\n✅ Token gerado com sucesso!");
    console.log("\nBearer " + token + "\n");
}
catch (err) {
    console.error("❌ Erro ao gerar o token:", err);
}
