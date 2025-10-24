"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
// Carrega variáveis de ambiente do arquivo .env
dotenv_1.default.config();
// Pega a URI do MongoDB do .env ou usa fallback local apenas se necessário
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("❌ ERRO: Variável MONGO_URI não encontrada no .env");
    process.exit(1);
}
const connectDB = async () => {
    try {
        console.log("🔌 Tentando conectar ao MongoDB...");
        console.log("🔎 URI usada:", MONGO_URI);
        await mongoose_1.default.connect(MONGO_URI);
        console.log("✅ Conectado ao MongoDB com sucesso!");
    }
    catch (error) {
        console.error("🚨 Erro ao conectar ao MongoDB:", error);
        process.exit(1);
    }
};
exports.connectDB = connectDB;
