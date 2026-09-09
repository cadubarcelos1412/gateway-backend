// src/utils/oauthTokens.ts
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { ApiKeyMode } from "../models/apiKey.model";

/**
 * 🔐 Tokens OAuth 2.1 da PYX Gate — assinados com HMAC-SHA256 (HS256)
 * usando o mesmo SECRET_TOKEN que já assina o JWT do dashboard.
 *
 * Por que HMAC e não Argon2/bcrypt aqui: são primitivas para problemas
 * diferentes. Argon2/bcrypt são KDFs lentas de propósito, feitas pra
 * proteger segredo de BAIXA entropia (senha humana) contra força bruta
 * offline — é por isso que o login usa bcryptjs. Um access token e um
 * client_secret nossos têm 256 bits de entropia aleatória: força bruta é
 * inviável por construção, e o que se precisa é de (a) integridade
 * verificável sem ida ao banco → HMAC, e (b) comparação em tempo
 * constante do que está no banco → SHA-256 + timingSafeEqual, exatamente
 * o que utils/apiKeys.ts já faz pras chaves sk_. Trocar isso por Argon2
 * adicionaria uma dependência nativa (build no Render) e latência por
 * requisição, sem ganho de segurança nenhum.
 */

const SECRET = process.env.SECRET_TOKEN;
const ISSUER = process.env.ISSUER;

if (!SECRET || !ISSUER) {
  console.error("❌ Variáveis SECRET_TOKEN ou ISSUER ausentes no .env");
  process.exit(1);
}

/** Escopos suportados. Sem escopo curinga: token OAuth é sempre granular. */
export const OAUTH_SCOPES = [
  "account:read",
  "payments:read",
  "payments:write",
  "webhooks:read",
  "webhooks:write",
  "test:write",
] as const;

export type OAuthScope = (typeof OAUTH_SCOPES)[number];

/** Escopos oferecidos por padrão quando o cliente não pede nada explícito. */
export const DEFAULT_SCOPES: OAuthScope[] = ["account:read", "payments:read", "payments:write", "test:write"];

/**
 * Escopos que movem dinheiro de verdade. Em modo "live" a tela de consentimento
 * destaca esses; em "test" eles são inofensivos por construção.
 */
export const WRITE_SCOPES: OAuthScope[] = ["payments:write", "webhooks:write"];

export interface OAuthAccessTokenClaims {
  /** ObjectId do Seller (merchant) dono do token. */
  sub: string;
  /** client_id da aplicação que recebeu o consentimento. */
  cid: string;
  /** Modo escolhido no consentimento — não é parâmetro de requisição. */
  mode: ApiKeyMode;
  scope: string;
  aud: string;
  iss?: string;
  exp?: number;
}

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h — refresh cobre o resto.

/**
 * Recursos (audiences) que esta instalação reconhece — CSV em
 * MCP_RESOURCE_URL, ou `${BASE_URL}/mcp` por padrão.
 *
 * Sem essa lista, o `resource` do RFC 8707 seria o que o cliente mandasse:
 * daria pra registrar um cliente e pedir token com audiência arbitrária.
 * Aqui isso não daria acesso a nada (o /v1 só aceita as audiências desta
 * lista), mas vira confused deputy no dia em que existir um segundo
 * resource server. Validar na emissão é o lugar certo.
 */
export function allowedResources(): string[] {
  const base = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
  const raw = process.env.MCP_RESOURCE_URL || `${base}/mcp`;
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function mintAccessToken(params: {
  merchantId: string;
  clientId: string;
  mode: ApiKeyMode;
  scopes: string[];
  audience: string;
}): string {
  return jwt.sign(
    {
      sub: params.merchantId,
      cid: params.clientId,
      mode: params.mode,
      scope: params.scopes.join(" "),
    },
    SECRET!,
    {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      issuer: ISSUER,
      audience: params.audience,
    }
  );
}

/**
 * Verifica assinatura, issuer, expiração e audiência. A audiência é o
 * recurso pro qual o token foi emitido (RFC 8707) — sem checar isso, um
 * token emitido pra outro recurso da mesma instalação seria aceito aqui.
 */
export function verifyAccessToken(token: string, audience: string | string[]): OAuthAccessTokenClaims | null {
  try {
    return jwt.verify(token, SECRET!, { issuer: ISSUER, audience }) as OAuthAccessTokenClaims;
  } catch {
    return null;
  }
}

/** Segredo opaco de alta entropia (code, refresh token, client_secret). */
export function generateOpaqueSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Comparação em tempo constante de dois hashes hex (mesmo padrão de apiKeys.ts). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * PKCE S256 (RFC 7636). "plain" não é aceito — OAuth 2.1 exige S256 pra
 * cliente público, e todo cliente MCP é público (roda na máquina do usuário,
 * não guarda segredo).
 */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
  return computed.length === challenge.length && crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}

/**
 * Aceita "a b c", ["a","b"] ou ["a b", "c"] — um formulário HTML com campo
 * repetido chega como array, e um valor só chega como string. Tratar só
 * string fazia o pedido virar [] e cair silenciosamente no DEFAULT_SCOPES,
 * o que tornava `webhooks:write` impossível de conceder (achado no E2E).
 */
export function parseScopes(raw: unknown): OAuthScope[] {
  const partes = (Array.isArray(raw) ? raw : [raw])
    .filter((v): v is string => typeof v === "string")
    .flatMap((v) => v.split(/[\s+]+/))
    .filter(Boolean);
  if (partes.length === 0) return [];
  return OAUTH_SCOPES.filter((s) => partes.includes(s));
}
