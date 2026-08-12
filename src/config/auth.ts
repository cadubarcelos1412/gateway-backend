// src/config/auth.ts
import "dotenv/config";
import jwt from "jsonwebtoken";

export interface TokenPayload {
  id: string;
  role: "seller" | "admin" | "master";
}

const SECRET = process.env.SECRET_TOKEN;
const ISSUER = process.env.ISSUER;

if (!SECRET || !ISSUER) {
  console.error("❌ Variáveis SECRET_TOKEN ou ISSUER ausentes no .env");
  process.exit(1);
}

/**
 * 🔐 Cria um JWT válido — 24h por padrão, 30 dias com "lembrar-me".
 *
 * Antes disso TODO login expirava em 24h sem exceção — o checkbox
 * "Lembrar-me" só tentava fazer o navegador salvar a senha (Credential
 * Management API), nunca alterava a duração da sessão em si. Resultado:
 * mesmo marcando, o usuário caía pra tela de login todo dia. Achado em
 * 2026-08-12.
 */
export const createToken = async (payload: TokenPayload, rememberMe = false): Promise<string> => {
  return jwt.sign(payload, SECRET, {
    expiresIn: rememberMe ? "30d" : "24h",
    issuer: ISSUER,
  });
};

/**
 * 🔓 Verifica e decodifica o JWT recebido
 */
export const decodeToken = async (token: string): Promise<TokenPayload | undefined> => {
  try {
    const decoded = jwt.verify(token, SECRET, { issuer: ISSUER });
    return decoded as TokenPayload;
  } catch (err) {
    if (err instanceof Error) {
      console.warn("⚠️ Token inválido ou expirado:", err.message);
    } else {
      console.warn("⚠️ Erro desconhecido ao decodificar token:", err);
    }
    return undefined;
  }
};

/**
 * 👑 Cria um Master Token manualmente (para testes ou Postman)
 */
export const createMasterToken = async (): Promise<string> => {
  const MASTER_ID = "68f29b8a1100e7bb3652f44f"; // 🆔 ID real do master criado no banco
  return jwt.sign(
    {
      id: MASTER_ID,
      role: "master",
    },
    SECRET,
    {
      expiresIn: "24h",
      issuer: ISSUER,
    }
  );
};
