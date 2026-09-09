// src/models/oauthGrant.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";
import { ApiKeyMode } from "./apiKey.model";

/**
 * Authorization codes e refresh tokens. Uma coleção só porque o ciclo de
 * vida é o mesmo: segredo opaco de alta entropia, guardado só como
 * SHA-256, uso único, com expiração deixada a cargo do próprio Mongo
 * (índice TTL) em vez de um job de limpeza.
 *
 * Access token NÃO mora aqui — é HS256 stateless, validado por assinatura
 * (ver utils/oauthTokens.ts). O preço disso é que revogar um access token
 * só tem efeito quando ele expira (1h); o refresh, esse sim, é revogável
 * na hora porque passa pelo banco.
 */
export interface IOAuthGrant extends Document {
  kind: "code" | "refresh";
  /** SHA-256 do segredo entregue ao cliente. O valor cru nunca é persistido. */
  hashedSecret: string;
  clientId: string;
  merchantId: Types.ObjectId;
  mode: ApiKeyMode;
  scopes: string[];
  /** Só para kind "code": PKCE + redirect_uri, amarrados na emissão. */
  codeChallenge?: string;
  redirectUri?: string;
  /** Recurso (audience) pro qual o access token vai ser emitido. */
  resource: string;
  /** Marcado no primeiro uso — reuso de código ou de refresh é ataque, não erro. */
  usedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

const OAuthGrantSchema = new Schema<IOAuthGrant>(
  {
    kind: { type: String, enum: ["code", "refresh"], required: true },
    hashedSecret: { type: String, required: true, unique: true, index: true },
    clientId: { type: String, required: true, index: true },
    merchantId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    mode: { type: String, enum: ["test", "live"], required: true },
    scopes: { type: [String], required: true },
    codeChallenge: { type: String },
    redirectUri: { type: String },
    resource: { type: String, required: true },
    usedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

// Mongo apaga sozinho quando expiresAt passa — sem job de limpeza pra manter.
OAuthGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthGrant = mongoose.model<IOAuthGrant>("OAuthGrant", OAuthGrantSchema);
