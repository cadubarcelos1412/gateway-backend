// src/models/oauthClient.model.ts
import mongoose, { Schema, Document } from "mongoose";

/**
 * Aplicação registrada via Dynamic Client Registration (RFC 7591) — é assim
 * que um cliente MCP (Claude, Cursor, n8n) se apresenta sem ninguém precisar
 * cadastrar nada à mão no painel.
 *
 * Cliente público (MCP roda na máquina do usuário) não tem client_secret:
 * a segurança vem de PKCE S256 + redirect_uri de match exato.
 */
export interface IOAuthClient extends Document {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  /** SHA-256 do client_secret. Ausente em cliente público. */
  hashedClientSecret?: string;
  isPublic: boolean;
  logoUri?: string;
  clientUri?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OAuthClientSchema = new Schema<IOAuthClient>(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    clientName: { type: String, required: true, trim: true, maxlength: 120 },
    redirectUris: { type: [String], required: true },
    hashedClientSecret: { type: String },
    isPublic: { type: Boolean, required: true, default: true },
    logoUri: { type: String },
    clientUri: { type: String },
  },
  { timestamps: true, versionKey: false }
);

export const OAuthClient = mongoose.model<IOAuthClient>("OAuthClient", OAuthClientSchema);
