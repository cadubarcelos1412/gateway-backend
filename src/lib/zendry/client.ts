// Cliente base da API Zendry — autenticação (OAuth client_credentials) e um
// helper de fetch autenticado, reutilizado por pix.ts e card.ts. Isolado
// aqui pra não duplicar a lógica de token em cada módulo (era o caso no
// projeto original: zendry-provider.ts e card-payment.ts cada um tinha sua
// própria cópia de getAccessToken()).
//
// Não há ambiente de sandbox documentado nem confirmado pra essa API — toda
// a integração de origem foi validada contra produção mesmo, com valores
// baixos (ex.: R$ 1,00). Ver ZENDRY-MIGRATION.md.

export const ZENDRY_API_BASE = "https://api.zendry.com.br";

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.ZENDRY_CLIENT_ID;
  const clientSecret = process.env.ZENDRY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("ZENDRY_CLIENT_ID / ZENDRY_CLIENT_SECRET não configurados.");
  }
  return { clientId, clientSecret };
}

// Cache em memória — válido por expires_in (1800s = 30min na prática),
// renovado com 60s de folga. Em ambientes serverless (Vercel functions) esse
// cache só vale DENTRO da mesma instância "quente"; instâncias novas geram
// um token novo — isso é esperado e não é um bug, só significa que
// /auth/generate_token pode ser chamado mais de uma vez por período de 30min
// sob tráfego real. Não é um problema de rate limit conhecido, mas monitore
// se migrar pra um volume alto.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getZendryAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const { clientId, clientSecret } = getCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${ZENDRY_API_BASE}/auth/generate_token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Zendry recusou a geração do token (${res.status}): ${errorBody}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

// Helper genérico pra chamar qualquer endpoint autenticado da Zendry. Lança
// erro com o corpo da resposta em caso de falha — quem chama decide como
// tratar (nunca inclua o `body` da REQUISIÇÃO no erro se ela tiver dados de
// cartão; o corpo da RESPOSTA de erro da Zendry é seguro de logar).
export async function zendryFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<T> {
  const token = await getZendryAccessToken();

  const res = await fetch(`${ZENDRY_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Zendry ${init.method} ${path} falhou (${res.status}): ${errorBody}`);
  }

  return res.json() as Promise<T>;
}
