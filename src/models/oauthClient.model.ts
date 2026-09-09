// src/models/oauthClient.model.ts
import mongoose, { Schema, Document } from "mongoose";

/**
 * Aplicação registrada via Dynamic Client Registration (RFC 7591) — é assim
 * que um cliente MCP (Claude, Cursor, n8n) se apresenta sem ninguém precisar
 * cadastrar nada à mão.
 *
 * Todo cliente aqui é público: roda na máquina do usuário e não consegue
 * guardar segredo. A segurança vem de PKCE S256 + redirect_uri de match
 * exato, não de client_secret.
 */
export interface IOAuthClient extends Document {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: Date;
  updatedAt: Date;
}

const OAuthClientSchema = new Schema<IOAuthClient>(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    clientName: { type: String, required: true, trim: true, maxlength: 120 },
    redirectUris: { type: [String], required: true },
  },
  { timestamps: true, versionKey: false }
);

export const OAuthClient = mongoose.model<IOAuthClient>("OAuthClient", OAuthClientSchema);
