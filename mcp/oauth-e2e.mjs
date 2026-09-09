// E2E do fluxo OAuth 2.1: descoberta → registro dinâmico → consentimento →
// code → token → chamada autenticada em /v1 → refresh → escopo negado.
//
// Precisa de um gateway rodando com um banco de DESENVOLVIMENTO (nunca o de
// produção) e do seed dev aplicado. Ver README.md deste diretório.
//
//   GATEWAY_URL=http://127.0.0.1:3010 \
//   SELLER_EMAIL=seller@pyxgate.com SELLER_PASSWORD=PyxGate123 \
//   node oauth-e2e.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";

const GATEWAY = (process.env.GATEWAY_URL || "http://127.0.0.1:3010").replace(/\/$/, "");
const RESOURCE = (process.env.MCP_RESOURCE_URL || "http://127.0.0.1:4445/mcp").replace(/\/$/, "");
const EMAIL = process.env.SELLER_EMAIL || "seller@pyxgate.com";
const PASSWORD = process.env.SELLER_PASSWORD || "PyxGate123";
const REDIRECT = "http://127.0.0.1:9876/callback";

const form = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined));
const ok = (label) => console.log(`  ✓ ${label}`);

/* 1. Descoberta (RFC 8414) --------------------------------------------------*/
const meta = await (await fetch(`${GATEWAY}/.well-known/oauth-authorization-server`)).json();
assert.equal(meta.issuer, GATEWAY);
assert.deepEqual(meta.code_challenge_methods_supported, ["S256"], "PKCE S256 tem que ser o único método");
assert.ok(meta.registration_endpoint && meta.token_endpoint && meta.authorization_endpoint);
ok("descoberta do authorization server");

/* 2. Registro dinâmico (RFC 7591) -------------------------------------------*/
const reg = await (
  await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Self-check MCP", redirect_uris: [REDIRECT] }),
  })
).json();
assert.match(reg.client_id, /^pyx_client_/);
assert.equal(reg.token_endpoint_auth_method, "none", "cliente MCP é público: sem client_secret");
ok(`registro dinâmico → ${reg.client_id}`);

// Redirect fora do padrão tem que ser recusado no registro.
const mau = await fetch(meta.registration_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ client_name: "Malicioso", redirect_uris: ["javascript:alert(1)"] }),
});
assert.equal(mau.status, 400, "redirect_uri não-http deveria ser recusada");
ok("redirect_uri maliciosa recusada no registro");

/* 3. PKCE + tela de consentimento -------------------------------------------*/
const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
const scope = "account:read payments:read payments:write test:write";
const authParams = {
  client_id: reg.client_id,
  redirect_uri: REDIRECT,
  response_type: "code",
  code_challenge: challenge,
  code_challenge_method: "S256",
  state: "estado-123",
  scope,
  resource: RESOURCE,
};

const tela = await fetch(`${meta.authorization_endpoint}?${form(authParams)}`);
const html = await tela.text();
assert.equal(tela.status, 200);
assert.match(html, /Autorizar/);
assert.match(html, /Criar cobranças Pix em seu nome/, "a tela precisa explicar cada permissão");
assert.match(html, /Produção — dinheiro real/, "a tela precisa deixar escolher o ambiente");
ok("tela de consentimento renderizada com escopos e escolha de ambiente");

// Sem PKCE não passa.
const semPkce = await fetch(`${meta.authorization_endpoint}?${form({ ...authParams, code_challenge: "", code_challenge_method: "" })}`, { redirect: "manual" });
assert.match(semPkce.headers.get("location") || "", /error=invalid_request/, "authorize sem PKCE deveria falhar");
ok("authorize sem PKCE recusado");

/* 4. Consentimento → code ---------------------------------------------------*/
const senhaErrada = await fetch(meta.authorization_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form({ ...authParams, email: EMAIL, password: "errada", mode: "test", scope: "payments:read", decision: "allow" }),
  redirect: "manual",
});
assert.equal(senhaErrada.status, 401, "senha errada não pode emitir code");
ok("senha inválida recusada");

const consent = await fetch(meta.authorization_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  // "scope" repetido = os checkboxes marcados. webhooks:write NÃO é marcado
  // de propósito: é o que o passo 7 usa pra provar o bloqueio por escopo.
  body: new URLSearchParams([
    ...Object.entries({ ...authParams, scope: undefined }).filter(([, v]) => v !== undefined),
    // requested_scope = o conjunto pedido (campo oculto); scope repetido = os
    // checkboxes marcados. Nomes diferentes de propósito: com o mesmo nome o
    // POST vira array e o pedido inteiro era descartado (bug corrigido).
    ["requested_scope", scope],
    ["email", EMAIL], ["password", PASSWORD], ["mode", "test"], ["decision", "allow"],
    ["scope", "account:read"], ["scope", "payments:read"], ["scope", "payments:write"], ["scope", "test:write"],
  ]),
  redirect: "manual",
});
assert.equal(consent.status, 302);
const back = new URL(consent.headers.get("location"));
assert.equal(back.searchParams.get("state"), "estado-123", "state precisa voltar intacto (CSRF)");
const code = back.searchParams.get("code");
assert.ok(code, `esperava code, veio: ${back.search}`);
ok("consentimento aceito → authorization code emitido");

/* 5. Troca do code (PKCE) ---------------------------------------------------*/
const pkceErrado = await fetch(meta.token_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: crypto.randomBytes(32).toString("base64url") }),
});
assert.equal(pkceErrado.status, 400, "code_verifier errado tem que falhar");
ok("code_verifier errado recusado");

const tokenRes = await fetch(meta.token_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: verifier }),
});
const tok = await tokenRes.json();
assert.equal(tokenRes.status, 200, JSON.stringify(tok));
assert.equal(tok.token_type, "Bearer");
assert.ok(tok.access_token && tok.refresh_token);
assert.equal(tok.scope, "account:read payments:read payments:write test:write");
ok(`access token emitido (expira em ${tok.expires_in}s, escopos: ${tok.scope})`);

/* 6. O token funciona no /v1, respeitando escopo ----------------------------*/
const H = { Authorization: `Bearer ${tok.access_token}` };

const conta = await fetch(`${GATEWAY}/v1/account`, { headers: H });
assert.equal(conta.status, 200, `esperava 200 em /v1/account, veio ${conta.status}: ${await conta.text()}`);
ok("token OAuth autentica em /v1/account");

const semEscopo = await fetch(`${GATEWAY}/v1/webhook_endpoints`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://x.com/h", events: ["payment.paid"] }) });
assert.equal(semEscopo.status, 403, "sem webhooks:write tinha que dar 403");
assert.equal((await semEscopo.json()).error.code, "insufficient_scope");
ok("escopo não concedido bloqueado com insufficient_scope (403)");

const audErrada = await fetch(`${GATEWAY}/v1/account`, { headers: { Authorization: "Bearer nao.e.um.token" } });
assert.equal(audErrada.status, 401);
ok("token inválido recusado com 401");

/* 7. Cobrança real via token OAuth (modo teste) -----------------------------*/
const pagRes = await fetch(`${GATEWAY}/v1/payments`, {
  method: "POST",
  headers: { ...H, "Content-Type": "application/json", "Idempotency-Key": `e2e-${Date.now()}` },
  body: JSON.stringify({ amount: 1990, payment_method: "pix", customer: { name: "Maria Compradora", email: "maria@example.com", document: "39053344705" } }),
});
const pag = await pagRes.json();
assert.equal(pagRes.status, 201, JSON.stringify(pag));
assert.equal(pag.mode, "test", "o modo vem do consentimento, não do payload");
assert.ok(pag.qr_code, "cobrança sem qr_code");
ok(`cobrança criada via OAuth: ${pag.id} (modo ${pag.mode}, QR de ${pag.qr_code.length} chars)`);

/* 8. Refresh com rotação ----------------------------------------------------*/
const refresh = (t) =>
  fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form({ grant_type: "refresh_token", refresh_token: t, client_id: reg.client_id }),
  });

const refRes = await refresh(tok.refresh_token);
const ref = await refRes.json();
assert.equal(refRes.status, 200, JSON.stringify(ref));
assert.ok(ref.access_token && ref.refresh_token);
assert.notEqual(ref.refresh_token, tok.refresh_token, "o refresh token tem que rotacionar");
ok("refresh token trocado e rotacionado");

assert.equal((await refresh(tok.refresh_token)).status, 400, "reuso de refresh token tem que ser recusado");
ok("reuso de refresh token recusado");

/* 9. Reuso do code = ataque, e a revogação em cascata -----------------------*/
// OAuth 2.1: reuso de authorization code obriga a revogar TUDO que foi
// emitido a partir dele. Por isso este passo vem por último — ele derruba
// de propósito a sessão que os passos anteriores usaram.
const reuso = await fetch(meta.token_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: verifier }),
});
assert.equal(reuso.status, 400, "reuso de code tem que ser recusado");
ok("reuso de authorization code recusado");

assert.equal((await refresh(ref.refresh_token)).status, 400, "o refresh vivo tinha que ter sido revogado junto");
ok("revogação em cascata: o refresh token válido morreu junto com o code reusado");

console.log("\n✅ OAuth 2.1 de ponta a ponta: descoberta, DCR, PKCE, consentimento, escopos, rotação de refresh e revogação em cascata.");
