"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMasterToken = exports.decodeToken = exports.createToken = void 0;
// src/config/auth.ts
require("dotenv/config");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const SECRET = process.env.SECRET_TOKEN;
const ISSUER = process.env.ISSUER;
if (!SECRET || !ISSUER) {
    console.error("❌ Variáveis SECRET_TOKEN ou ISSUER ausentes no .env");
    process.exit(1);
}
/**
 * 🔐 Cria um JWT válido com expiração de 24h
 */
const createToken = async (payload) => {
    return jsonwebtoken_1.default.sign(payload, SECRET, {
        expiresIn: "24h",
        issuer: ISSUER,
    });
};
exports.createToken = createToken;
/**
 * 🔓 Verifica e decodifica o JWT recebido
 */
const decodeToken = async (token) => {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, SECRET, { issuer: ISSUER });
        return decoded;
    }
    catch (err) {
        if (err instanceof Error) {
            console.warn("⚠️ Token inválido ou expirado:", err.message);
        }
        else {
            console.warn("⚠️ Erro desconhecido ao decodificar token:", err);
        }
        return undefined;
    }
};
exports.decodeToken = decodeToken;
/**
 * 👑 Cria um Master Token manualmente (para testes ou Postman)
 */
const createMasterToken = async () => {
    const MASTER_ID = "68f29b8a1100e7bb3652f44f"; // 🆔 ID real do master criado no banco
    return jsonwebtoken_1.default.sign({
        id: MASTER_ID,
        role: "master",
    }, SECRET, {
        expiresIn: "24h",
        issuer: ISSUER,
    });
};
exports.createMasterToken = createMasterToken;
