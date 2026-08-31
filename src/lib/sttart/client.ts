// Cliente base da API Sttart — autenticação OAuth2 estilo Keycloak
// (POST /v1/api/auth/login + /v1/api/auth/refresh) e um helper de fetch
// autenticado, mesmo papel que lib/zendry/client.ts cumpre pro lado Zendry.
//
// Diferente da Zendry (1 token de 30min via client_credentials simples), a
// Sttart documenta 2 tokens de vida curta: access_token (~300s) e
// refresh_token (~1800s) — cacheamos os dois e preferimos refresh a um novo
// login inteiro quando o access_token expira mas o refresh_token ainda vale.
//
// IMPORTANTE (confirmado pelo OpenAPI real do serviço Auth da Sttart, não
// suposição): `LoginDto` exige `username`, `password`, `realm` e `clientId`
// — NÃO é uma chave de API única. `clientSecret` é opcional (client
// "público" no Keycloak pode não ter secret). `grantType` aceita vários
// valores; como o schema marca username/password como obrigatórios pra
// qualquer grant, o default aqui é "password" (grant que de fato usa esses
// dois campos) — client_credentials fica disponível via
// STTART_GRANT_TYPE=client_credentials pra quando/se a Sttart confirmar que
// funciona sem usuário real, mas isso ainda não foi testado ao vivo.
//
// Sem sandbox confirmado ainda (ver plano de integração) — toda chamada aqui
// é contra o ambiente configurado em STTART_API_BASE_URL, que TEM que vir
// das env vars: não tem domínio de produção confirmado o suficiente pra
// hardcodar aqui (diferente da Zendry, cujo domínio foi validado ao vivo).

function getSttartApiBase(): string {
  const base = process.env.STTART_API_BASE_URL;
  if (!base) {
    throw new Error("STTART_API_BASE_URL não configurada.");
  }
  return base.replace(/\/+$/, "");
}

function getCredentials(): {
  username: string;
  password: string;
  realm: string;
  clientId: string;
  clientSecret?: string;
  grantType: string;
  tenantId?: string;
} {
  const username = process.env.STTART_USERNAME;
  const password = process.env.STTART_PASSWORD;
  const realm = process.env.STTART_REALM;
  const clientId = process.env.STTART_CLIENT_ID;
  if (!username || !password || !realm || !clientId) {
    throw new Error(
      "Credenciais Sttart incompletas: STTART_USERNAME, STTART_PASSWORD, STTART_REALM e STTART_CLIENT_ID são obrigatórios (LoginDto da Sttart exige os 4)."
    );
  }
  return {
    username,
    password,
    realm,
    clientId,
    clientSecret: process.env.STTART_CLIENT_SECRET || undefined,
    grantType: process.env.STTART_GRANT_TYPE || "password",
    tenantId: process.env.STTART_TENANT_ID || undefined,
  };
}

interface SttartTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_expires_in?: number;
}

// Envelope confirmado ao vivo em 2 serviços diferentes da Sttart (Auth e
// Cash-In, 2026-08-31): toda resposta vem como { success, data, meta }, o
// payload de verdade sempre dentro de `data`. Assumimos que vale pra API
// inteira (mesmo padrão nos 2 serviços testados) — se algum endpoint novo
// vier em formato diferente, é a primeira coisa a conferir.
interface SttartEnvelope<T> {
  success: boolean;
  data: T;
}

// Cache em memória — mesma ressalva de lib/zendry/client.ts: só vale dentro
// da mesma instância "quente" em ambiente serverless.
let cachedTokens: {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
} | null = null;

async function login(): Promise<SttartTokenResponse> {
  const { username, password, realm, clientId, clientSecret, grantType, tenantId } = getCredentials();

  const res = await fetch(`${getSttartApiBase()}/v1/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      realm,
      clientId,
      grantType,
      ...(clientSecret ? { clientSecret } : {}),
      ...(tenantId ? { tenantId } : {}),
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Sttart recusou o login (${res.status}): ${errorBody}`);
  }

  const body = (await res.json()) as SttartEnvelope<SttartTokenResponse>;
  return body.data;
}

async function refresh(refreshToken: string): Promise<SttartTokenResponse> {
  const { clientId, clientSecret } = getCredentials();

  const res = await fetch(`${getSttartApiBase()}/v1/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret, refreshToken }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Sttart recusou o refresh (${res.status}): ${errorBody}`);
  }

  const body = (await res.json()) as SttartEnvelope<SttartTokenResponse>;
  return body.data;
}

function storeTokens(tokens: SttartTokenResponse): void {
  const now = Date.now();
  cachedTokens = {
    accessToken: tokens.access_token,
    accessExpiresAt: now + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token,
    refreshExpiresAt: tokens.refresh_expires_in ? now + tokens.refresh_expires_in * 1000 : undefined,
  };
}

export async function getSttartAccessToken(): Promise<string> {
  const SAFETY_MARGIN_MS = 15_000;

  if (cachedTokens && Date.now() < cachedTokens.accessExpiresAt - SAFETY_MARGIN_MS) {
    return cachedTokens.accessToken;
  }

  if (
    cachedTokens?.refreshToken &&
    cachedTokens.refreshExpiresAt &&
    Date.now() < cachedTokens.refreshExpiresAt - SAFETY_MARGIN_MS
  ) {
    try {
      const tokens = await refresh(cachedTokens.refreshToken);
      storeTokens(tokens);
      return cachedTokens.accessToken;
    } catch (err) {
      // Refresh falhou (token revogado/expirado do lado da Sttart, por
      // exemplo) — cai pro login completo em vez de propagar o erro.
      console.warn("⚠️ Refresh de token Sttart falhou, tentando login completo:", err);
    }
  }

  const tokens = await login();
  storeTokens(tokens);
  return cachedTokens!.accessToken;
}

// Helper genérico pra chamar qualquer endpoint autenticado da Sttart —
// mesma disciplina de erro do zendryFetch (nunca inclua o body da
// REQUISIÇÃO se tiver dado sensível; o corpo da RESPOSTA de erro é seguro
// de logar).
export async function sttartFetch<T>(
  path: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }
): Promise<T> {
  const token = await getSttartAccessToken();

  const res = await fetch(`${getSttartApiBase()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    const err = new Error(`Sttart ${init.method} ${path} falhou (${res.status}): ${errorBody}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  if (res.status === 204) return undefined as unknown as T;
  const body = (await res.json()) as SttartEnvelope<T>;
  return body.data;
}
