// src/controllers/oauth.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { User } from "../models/user.model";
import { Seller } from "../models/seller.model";
import { OAuthClient } from "../models/oauthClient.model";
import { OAuthGrant } from "../models/oauthGrant.model";
import { ApiKeyMode } from "../models/apiKey.model";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_SCOPES,
  OAUTH_SCOPES,
  OAuthScope,
  WRITE_SCOPES,
  generateOpaqueSecret,
  hashSecret,
  mintAccessToken,
  parseScopes,
  timingSafeEqualHex,
  verifyPkceS256,
  allowedResources,
} from "../utils/oauthTokens";

const CODE_TTL_MS = 60 * 1000; // 1 min — o cliente troca na hora.
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias.

function baseUrl(): string {
  return (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

/** Recurso (audience) padrão: o primeiro da lista reconhecida. */
function defaultResource(): string {
  return allowedResources()[0];
}

function oauthError(res: Response, status: number, error: string, description: string): void {
  res.status(status).json({ error, error_description: description });
}

/** Escapa para interpolação segura em HTML — os valores vêm da query string. */
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

/* -------------------------------------------------------------------------- */
/* 📇 Metadata                                                               */
/* -------------------------------------------------------------------------- */

/** GET /.well-known/oauth-authorization-server (RFC 8414) */
export const authorizationServerMetadata = (_req: Request, res: Response): void => {
  const base = baseUrl();
  res.status(200).json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    scopes_supported: OAUTH_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    service_documentation: `${base}/docs#mcp`,
  });
};

/**
 * GET /.well-known/oauth-protected-resource (RFC 9728)
 * Publicado também aqui (além do próprio servidor MCP) pra quem descobre o
 * recurso a partir do domínio da API.
 */
export const protectedResourceMetadata = (_req: Request, res: Response): void => {
  res.status(200).json({
    resource: defaultResource(),
    authorization_servers: [baseUrl()],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
  });
};

/* -------------------------------------------------------------------------- */
/* 🆕 Dynamic Client Registration (RFC 7591)                                 */
/* -------------------------------------------------------------------------- */

/** POST /oauth/register */
export const registerClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { client_name, redirect_uris, token_endpoint_auth_method, logo_uri, client_uri } = req.body ?? {};

    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      oauthError(res, 400, "invalid_redirect_uri", "redirect_uris é obrigatório e deve ser um array não vazio.");
      return;
    }

    // 🔒 Só http(s), e http só em loopback — é exatamente o caso de um
    // cliente MCP local (http://127.0.0.1:PORT/callback). Sem essa trava,
    // qualquer esquema (ex.: javascript:) viraria redirect autorizado.
    for (const uri of redirect_uris) {
      let parsed: URL;
      try {
        parsed = new URL(String(uri));
      } catch {
        oauthError(res, 400, "invalid_redirect_uri", `redirect_uri inválida: ${uri}`);
        return;
      }
      const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(parsed.hostname);
      const ok = parsed.protocol === "https:" || (parsed.protocol === "http:" && isLoopback);
      if (!ok) {
        oauthError(res, 400, "invalid_redirect_uri", "redirect_uri deve ser https, ou http apenas em loopback.");
        return;
      }
    }

    const isPublic = token_endpoint_auth_method !== "client_secret_post";
    const clientId = `pyx_client_${generateOpaqueSecret(16)}`;
    const clientSecret = isPublic ? undefined : generateOpaqueSecret(32);

    await OAuthClient.create({
      clientId,
      clientName: String(client_name || "Cliente MCP").slice(0, 120),
      redirectUris: redirect_uris.map(String),
      hashedClientSecret: clientSecret ? hashSecret(clientSecret) : undefined,
      isPublic,
      logoUri: logo_uri ? String(logo_uri) : undefined,
      clientUri: client_uri ? String(client_uri) : undefined,
    });

    res.status(201).json({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_name: String(client_name || "Cliente MCP").slice(0, 120),
      redirect_uris,
      token_endpoint_auth_method: isPublic ? "none" : "client_secret_post",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  } catch (err) {
    console.error("❌ Erro em registerClient:", err);
    oauthError(res, 500, "server_error", "Erro ao registrar cliente.");
  }
};

/* -------------------------------------------------------------------------- */
/* 🙋 Authorize — login do seller + consentimento                            */
/* -------------------------------------------------------------------------- */

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: OAuthScope[];
  resource: string;
}

/**
 * Valida os parâmetros comuns a GET e POST /oauth/authorize. Erros que
 * envolvem client_id/redirect_uri NÃO podem redirecionar (seria um open
 * redirect); são renderizados aqui mesmo.
 */
async function validateAuthorizeParams(
  req: Request,
  res: Response,
  source: Record<string, unknown>
): Promise<AuthorizeParams | null> {
  const clientId = String(source.client_id || "");
  const redirectUri = String(source.redirect_uri || "");
  const responseType = String(source.response_type || "code");
  const codeChallenge = String(source.code_challenge || "");
  const codeChallengeMethod = String(source.code_challenge_method || "");

  const client = await OAuthClient.findOne({ clientId });
  if (!client) {
    res.status(400).send(errorPage("Aplicação não reconhecida", "O client_id informado não existe ou foi removido."));
    return null;
  }

  if (!client.redirectUris.includes(redirectUri)) {
    res.status(400).send(errorPage("Redirecionamento não autorizado", "A redirect_uri não confere com nenhuma registrada por esta aplicação."));
    return null;
  }

  const state = String(source.state || "");
  const fail = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    res.redirect(url.toString());
    return null;
  };

  if (responseType !== "code") return fail("unsupported_response_type", "Apenas response_type=code é suportado.");
  if (codeChallengeMethod !== "S256" || !codeChallenge) {
    return fail("invalid_request", "PKCE com code_challenge_method=S256 é obrigatório.");
  }

  // RFC 8707: só emitimos token pra recurso que esta instalação conhece.
  const resource = String(source.resource || defaultResource()).replace(/\/$/, "");
  if (!allowedResources().includes(resource)) {
    return fail("invalid_target", `Recurso '${resource}' não é reconhecido por este servidor.`);
  }

  // GET traz "scope" na query; POST traz "requested_scope" no campo oculto
  // (o "scope" do POST são os checkboxes marcados, lidos em decideAuthorize).
  const asked = parseScopes(source.requested_scope ?? source.scope);
  return {
    clientId,
    redirectUri,
    state,
    codeChallenge,
    scopes: asked.length > 0 ? asked : DEFAULT_SCOPES,
    resource,
  };
}

/** GET /oauth/authorize — tela de login + consentimento. */
export const showAuthorize = async (req: Request, res: Response): Promise<void> => {
  const params = await validateAuthorizeParams(req, res, req.query as Record<string, unknown>);
  if (!params) return;

  const client = await OAuthClient.findOne({ clientId: params.clientId });
  res.status(200).send(consentPage(client?.clientName || "Aplicação", params));
};

/** POST /oauth/authorize — valida credenciais, registra o consentimento, emite o code. */
export const decideAuthorize = async (req: Request, res: Response): Promise<void> => {
  const params = await validateAuthorizeParams(req, res, req.body as Record<string, unknown>);
  if (!params) return;

  const client = await OAuthClient.findOne({ clientId: params.clientId });
  const clientName = client?.clientName || "Aplicação";

  const redirectWithError = (error: string, description: string) => {
    const url = new URL(params.redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (params.state) url.searchParams.set("state", params.state);
    res.redirect(url.toString());
  };

  if (req.body.decision !== "allow") {
    redirectWithError("access_denied", "Autorização negada pelo usuário.");
    return;
  }

  // Escopos efetivamente marcados na tela — nunca mais que o pedido.
  const checked = ([] as string[]).concat(req.body.scope ?? []);
  const granted = params.scopes.filter((s) => checked.includes(s));
  if (granted.length === 0) {
    res.status(400).send(consentPage(clientName, params, "Selecione ao menos uma permissão."));
    return;
  }

  const mode: ApiKeyMode = req.body.mode === "live" ? "live" : "test";

  try {
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email });
    const passwordMatches = user ? await bcrypt.compare(password, user.password) : false;

    if (!user || !passwordMatches) {
      res.status(401).send(consentPage(clientName, params, "E-mail ou senha inválidos."));
      return;
    }
    if (user.status !== "active") {
      res.status(403).send(consentPage(clientName, params, "Esta conta não está ativa. Contate o suporte."));
      return;
    }

    const seller = await Seller.findOne({ userId: user._id });
    if (!seller) {
      res.status(403).send(consentPage(clientName, params, "Nenhuma conta de seller vinculada a este usuário."));
      return;
    }

    const code = generateOpaqueSecret(32);
    await OAuthGrant.create({
      kind: "code",
      hashedSecret: hashSecret(code),
      clientId: params.clientId,
      merchantId: seller._id as Types.ObjectId,
      userId: user._id as Types.ObjectId,
      mode,
      scopes: granted,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      resource: params.resource,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });

    const url = new URL(params.redirectUri);
    url.searchParams.set("code", code);
    if (params.state) url.searchParams.set("state", params.state);
    res.redirect(url.toString());
  } catch (err) {
    console.error("❌ Erro em decideAuthorize:", err);
    redirectWithError("server_error", "Erro ao processar a autorização.");
  }
};

/* -------------------------------------------------------------------------- */
/* 🎟️ Token                                                                  */
/* -------------------------------------------------------------------------- */

/** Confere client_secret quando o cliente é confidencial. */
async function assertClient(clientId: string, clientSecret: unknown): Promise<boolean> {
  const client = await OAuthClient.findOne({ clientId });
  if (!client) return false;
  if (client.isPublic) return true;
  if (typeof clientSecret !== "string" || !client.hashedClientSecret) return false;
  return timingSafeEqualHex(client.hashedClientSecret, hashSecret(clientSecret));
}

/**
 * Emite access + refresh a partir de um grant já validado, rotacionando o
 * refresh token (o antigo é queimado por quem chamou).
 */
async function issueTokenPair(grant: {
  clientId: string;
  merchantId: Types.ObjectId;
  userId: Types.ObjectId;
  mode: ApiKeyMode;
  scopes: string[];
  resource: string;
}) {
  const refresh = generateOpaqueSecret(32);
  await OAuthGrant.create({
    kind: "refresh",
    hashedSecret: hashSecret(refresh),
    clientId: grant.clientId,
    merchantId: grant.merchantId,
    userId: grant.userId,
    mode: grant.mode,
    scopes: grant.scopes,
    resource: grant.resource,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  return {
    access_token: mintAccessToken({
      merchantId: String(grant.merchantId),
      clientId: grant.clientId,
      mode: grant.mode,
      scopes: grant.scopes,
      audience: grant.resource,
    }),
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh,
    scope: grant.scopes.join(" "),
  };
}

/** POST /oauth/token */
export const issueToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const grantType = String(req.body.grant_type || "");
    const clientId = String(req.body.client_id || "");

    if (!(await assertClient(clientId, req.body.client_secret))) {
      oauthError(res, 401, "invalid_client", "client_id desconhecido ou client_secret inválido.");
      return;
    }

    if (grantType === "authorization_code") {
      const code = String(req.body.code || "");
      const verifier = String(req.body.code_verifier || "");
      const grant = await OAuthGrant.findOne({ kind: "code", hashedSecret: hashSecret(code) });

      if (!grant || grant.expiresAt.getTime() < Date.now()) {
        oauthError(res, 400, "invalid_grant", "Código inválido ou expirado.");
        return;
      }
      // 🚨 Reuso de código = código vazou. Queima o grant inteiro em vez de
      // só recusar esta chamada (OAuth 2.1, seção de replay de code).
      if (grant.usedAt) {
        await OAuthGrant.deleteMany({ clientId: grant.clientId, merchantId: grant.merchantId });
        oauthError(res, 400, "invalid_grant", "Código já utilizado. Todas as sessões desta aplicação foram revogadas.");
        return;
      }
      if (grant.clientId !== clientId) {
        oauthError(res, 400, "invalid_grant", "Código emitido para outro client_id.");
        return;
      }
      if (grant.redirectUri !== String(req.body.redirect_uri || "")) {
        oauthError(res, 400, "invalid_grant", "redirect_uri diferente da usada na autorização.");
        return;
      }
      if (!verifier || !grant.codeChallenge || !verifyPkceS256(verifier, grant.codeChallenge)) {
        oauthError(res, 400, "invalid_grant", "code_verifier não confere com o code_challenge (PKCE).");
        return;
      }

      grant.usedAt = new Date();
      await grant.save();

      res.status(200).json(await issueTokenPair(grant));
      return;
    }

    if (grantType === "refresh_token") {
      const refreshToken = String(req.body.refresh_token || "");
      const grant = await OAuthGrant.findOne({ kind: "refresh", hashedSecret: hashSecret(refreshToken) });

      if (!grant || grant.expiresAt.getTime() < Date.now()) {
        oauthError(res, 400, "invalid_grant", "Refresh token inválido ou expirado.");
        return;
      }
      if (grant.usedAt) {
        // Mesma lógica do code: refresh é de uso único, reuso indica vazamento.
        await OAuthGrant.deleteMany({ clientId: grant.clientId, merchantId: grant.merchantId });
        oauthError(res, 400, "invalid_grant", "Refresh token reutilizado. Todas as sessões desta aplicação foram revogadas.");
        return;
      }
      if (grant.clientId !== clientId) {
        oauthError(res, 400, "invalid_grant", "Refresh token emitido para outro client_id.");
        return;
      }

      grant.usedAt = new Date();
      await grant.save();

      res.status(200).json(await issueTokenPair(grant));
      return;
    }

    oauthError(res, 400, "unsupported_grant_type", "Use authorization_code ou refresh_token.");
  } catch (err) {
    console.error("❌ Erro em issueToken:", err);
    oauthError(res, 500, "server_error", "Erro ao emitir token.");
  }
};

/** POST /oauth/revoke (RFC 7009) — revoga um refresh token. */
export const revokeToken = async (req: Request, res: Response): Promise<void> => {
  const token = String(req.body.token || "");
  if (token) await OAuthGrant.deleteOne({ kind: "refresh", hashedSecret: hashSecret(token) });
  // A RFC manda responder 200 mesmo pra token desconhecido — não vazar existência.
  res.status(200).json({ revoked: true });
};

/* -------------------------------------------------------------------------- */
/* 🎨 Telas                                                                   */
/* -------------------------------------------------------------------------- */

const SCOPE_LABELS: Record<OAuthScope, string> = {
  "account:read": "Ver os dados da sua conta (nome, status de KYC)",
  "payments:read": "Ver e listar seus pagamentos",
  "payments:write": "Criar cobranças Pix em seu nome",
  "webhooks:read": "Ver seus endpoints de webhook",
  "webhooks:write": "Criar, alterar e remover endpoints de webhook",
  "test:write": "Simular pagamentos em modo teste",
};

const PAGE_STYLE = `
  :root { --navy:#0B1B33; --emerald:#0FB47F; --slate:#64748B; --line:#E2E8F0; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#F1F5F9; color:var(--navy); padding:24px;
         font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card { background:#fff; border:1px solid var(--line); border-radius:16px; max-width:460px; width:100%;
          padding:32px; box-shadow:0 12px 32px rgba(11,27,51,.08); }
  h1 { font-size:20px; margin:0 0 6px; letter-spacing:-.02em; }
  p.sub { color:var(--slate); font-size:14px; margin:0 0 24px; line-height:1.5; }
  label.field { display:block; font-size:13px; font-weight:600; margin:14px 0 6px; }
  input[type=email], input[type=password] { width:100%; padding:11px 13px; border:1px solid var(--line);
          border-radius:9px; font-size:14px; font-family:inherit; }
  input:focus { outline:2px solid var(--emerald); outline-offset:-1px; border-color:transparent; }
  fieldset { border:1px solid var(--line); border-radius:11px; padding:14px 16px; margin:22px 0 0; }
  legend { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--slate); padding:0 6px; }
  .row { display:flex; gap:10px; align-items:flex-start; padding:7px 0; font-size:14px; line-height:1.45; }
  .row input { margin-top:3px; flex:none; }
  .modes { display:flex; gap:10px; margin-top:6px; }
  .modes label { flex:1; border:1px solid var(--line); border-radius:9px; padding:10px 12px; font-size:13px;
          cursor:pointer; display:flex; gap:8px; align-items:center; }
  .modes input:checked + span { font-weight:700; }
  .warn { background:#FEF3C7; border:1px solid #FDE68A; color:#78350F; border-radius:9px;
          padding:11px 13px; font-size:13px; margin-top:14px; line-height:1.45; }
  .err { background:#FEE2E2; border:1px solid #FECACA; color:#991B1B; border-radius:9px;
         padding:11px 13px; font-size:13px; margin-bottom:18px; }
  .actions { display:flex; gap:10px; margin-top:26px; }
  button { flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer;
           font-family:inherit; border:1px solid var(--line); background:#fff; color:var(--slate); }
  button.primary { background:var(--emerald); border-color:var(--emerald); color:#fff; }
  .brandbar { font-size:12px; font-weight:800; letter-spacing:.14em; color:var(--emerald); margin-bottom:18px; }
`;

function page(title: string, inner: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(title)} · PYX Gate</title><style>${PAGE_STYLE}</style></head>
<body><div class="card"><div class="brandbar">PYX GATE</div>${inner}</div></body></html>`;
}

function errorPage(title: string, message: string): string {
  return page(title, `<h1>${esc(title)}</h1><p class="sub">${esc(message)}</p>`);
}

function consentPage(clientName: string, params: AuthorizeParams, error?: string): string {
  const hidden = [
    ["client_id", params.clientId],
    ["redirect_uri", params.redirectUri],
    ["state", params.state],
    ["code_challenge", params.codeChallenge],
    ["code_challenge_method", "S256"],
    ["response_type", "code"],
    ["resource", params.resource],
    // NÃO pode se chamar "scope": os checkboxes abaixo usam esse nome, e o
    // POST chegaria como array misturando a string inteira com os itens.
    ["requested_scope", params.scopes.join(" ")],
  ]
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}" />`)
    .join("");

  const scopeRows = params.scopes
    .map(
      (s) =>
        `<div class="row"><input type="checkbox" id="s_${esc(s)}" name="scope" value="${esc(s)}" checked />
         <label for="s_${esc(s)}">${esc(SCOPE_LABELS[s])}<br /><code style="font-size:12px;color:#64748B">${esc(s)}</code></label></div>`
    )
    .join("");

  const hasWrite = params.scopes.some((s) => WRITE_SCOPES.includes(s));

  return page(
    "Autorizar aplicação",
    `<h1>Autorizar <strong>${esc(clientName)}</strong></h1>
     <p class="sub">Esta aplicação quer agir na sua conta PYX Gate. Entre com suas credenciais de seller e escolha o que ela pode fazer.</p>
     ${error ? `<div class="err">${esc(error)}</div>` : ""}
     <form method="post" action="/oauth/authorize">
       ${hidden}
       <label class="field" for="email">E-mail</label>
       <input id="email" type="email" name="email" required autocomplete="username" />
       <label class="field" for="password">Senha</label>
       <input id="password" type="password" name="password" required autocomplete="current-password" />

       <fieldset>
         <legend>Ambiente</legend>
         <div class="modes">
           <label><input type="radio" name="mode" value="test" checked /><span>Teste — sem dinheiro real</span></label>
           <label><input type="radio" name="mode" value="live" /><span>Produção — dinheiro real</span></label>
         </div>
         ${
           hasWrite
             ? `<div class="warn"><strong>Atenção:</strong> esta aplicação pode criar cobranças. Em <strong>Produção</strong> isso gera cobranças reais em nome da sua conta. Se você está apenas testando uma integração ou um agente de IA, mantenha <strong>Teste</strong>.</div>`
             : ""
         }
       </fieldset>

       <fieldset>
         <legend>Permissões</legend>
         ${scopeRows}
       </fieldset>

       <div class="actions">
         <button type="submit" name="decision" value="deny">Cancelar</button>
         <button type="submit" name="decision" value="allow" class="primary">Autorizar</button>
       </div>
     </form>`
  );
}
