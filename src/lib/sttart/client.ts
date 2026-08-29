// Cliente base da API Sttart — autenticação OAuth2 estilo Keycloak
// (POST /v1/api/auth/login + /v1/api/auth/refresh) e um helper de fetch
// autenticado, mesmo papel que lib/zendry/client.ts cumpre pro lado Zendry.
//
// Diferente da Zendry (1 token de 30min via client_credentials simples), a
// Sttart documenta 2 tokens de vida curta: access_token (~300s) e
// refresh_token (~1800s) — cacheamos os dois e preferimos refresh a um novo
// login inteiro quando o access_token expira mas o refresh_token ainda vale.
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
  clientId: string;
  clientSecret: string;
  realm?: string;
  tenantId?: string;
} {
  const clientId = process.env.STTART_CLIENT_ID;
  const clientSecret = process.env.STTART_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("STTART_CLIENT_ID / STTART_CLIENT_SECRET não configurados.");
  }
  return {
    clientId,
    clientSecret,
    realm: process.env.STTART_REALM || undefined,
    tenantId: process.env.STTART_TENANT_ID || undefined,
  };
}

interface SttartTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_expires_in?: number;
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
  const { clientId, clientSecret, realm, tenantId } = getCredentials();

  const res = await fetch(`${getSttartApiBase()}/v1/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      clientSecret,
      grantType: "client_credentials",
      ...(realm ? { realm } : {}),
      ...(tenantId ? { tenantId } : {}),
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Sttart recusou o login (${res.status}): ${errorBody}`);
  }

  return res.json() as Promise<SttartTokenResponse>;
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

  return res.json() as Promise<SttartTokenResponse>;
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
  return res.json() as Promise<T>;
}
