// src/utils/apiKeys.ts
import crypto from "crypto";
import { ApiKeyMode, ApiKeyType } from "../models/apiKey.model";

const TYPE_PREFIX: Record<ApiKeyType, string> = {
  secret: "sk",
  publishable: "pk",
};

interface GeneratedApiKey {
  fullKey: string;
  keyPrefix: string;
  last4: string;
  hashedKey: string;
}

/**
 * Gera uma chave de API no formato Stripe-like: sk_live_<64 hex> / pk_test_<64 hex>.
 * O corpo tem 32 bytes de entropia (crypto.randomBytes), codificado em hex.
 * A chave completa NUNCA é persistida — só o hash SHA-256.
 */
export function generateApiKey(type: ApiKeyType, mode: ApiKeyMode): GeneratedApiKey {
  const body = crypto.randomBytes(32).toString("hex");
  const prefix = `${TYPE_PREFIX[type]}_${mode}_`;
  const fullKey = `${prefix}${body}`;

  return {
    fullKey,
    keyPrefix: fullKey.slice(0, prefix.length + 8),
    last4: body.slice(-4),
    hashedKey: hashApiKey(fullKey),
  };
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Compara dois hashes hex em tempo constante, para evitar timing attacks
 * na validação de chaves de API.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function parseApiKeyType(rawKey: string): { type: ApiKeyType; mode: ApiKeyMode } | null {
  const match = rawKey.match(/^(sk|pk)_(test|live)_/);
  if (!match) return null;
  return {
    type: match[1] === "sk" ? "secret" : "publishable",
    mode: match[2] as ApiKeyMode,
  };
}
