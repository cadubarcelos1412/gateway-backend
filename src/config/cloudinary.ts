// src/config/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

// 🔒 Achado CRÍTICO em auditoria de segurança (2026-08-30): os fallbacks
// aqui eram a credencial REAL de produção (confirmado idêntica ao .env) —
// qualquer pessoa com acesso ao código-fonte (não ao ambiente) tinha acesso
// de admin à conta Cloudinary inteira, incluindo os documentos de KYC de
// todos os sellers. Nunca hardcodar segredo real como fallback — mesmo
// padrão fail-closed já usado em config/auth.ts (SECRET_TOKEN).
//
// ⚠️ AÇÃO NECESSÁRIA (fora do código): a chave antiga hardcoded precisa ser
// REVOGADA/ROTACIONADA no painel do Cloudinary — removê-la do código não
// desfaz uma exposição que já pode ter acontecido.
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error("❌ ERRO: CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET não configurados.");
  process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };
