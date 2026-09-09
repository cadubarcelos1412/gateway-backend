// Self-check do MCP: sobe uma /v1 falsa + o servidor MCP, e fala MCP de
// verdade por Streamable HTTP. Não precisa de banco nem de credencial real.
//
// Rodar: npm test
import assert from "node:assert/strict";
import express from "express";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const API_PORT = 4444;
const MCP_PORT = 4445;
const RESOURCE = `http://127.0.0.1:${MCP_PORT}/mcp`;
const EMV = "00020126TESTMODEdeadbeef5204000053039865802BR6009SAO PAULO";
const TOKEN = "fake.oauth.token";

/* ------------------------- /v1 falsa -------------------------------------- */
const seen = [];
const fake = express();
fake.use(express.json());
fake.use((req, _res, next) => {
  seen.push(`${req.method} ${req.path}`);
  assert.equal(req.headers.authorization, `Bearer ${TOKEN}`, "token não foi repassado pra /v1");
  next();
});
fake.post("/v1/payments", (req, res) => {
  assert.equal(req.headers["idempotency-key"], "pedido-1001");
  assert.equal(req.body.amount, 1990);
  assert.equal(req.body.payment_method, "pix");
  assert.equal(req.body.metadata.order_id, "pedido-1001");
  res.status(201).json({ id: "pay_abc123", status: "pending", mode: "test", amount: 1990, fee: 0, net_amount: 1990, payment_method: "pix", qr_code: EMV, qr_code_base64: "iVBOR" });
});
fake.get("/v1/payments/:id", (_req, res) =>
  res.json({ id: "pay_abc123", status: "paid", mode: "test", amount: 1990, fee: 60, net_amount: 1930, payment_method: "pix" }));
fake.get("/v1/payments", (req, res) => {
  assert.equal(req.query.status, "paid");
  assert.equal(req.query.limit, "20");
  res.json({ object: "list", data: [{ id: "pay_abc123", status: "paid", amount: 1990, created: 1757376000 }], page: 1, limit: 20, total: 1, has_more: false });
});
fake.get("/v1/account", (_res_, res) => res.json({ id: "acct_1", name: "Loja Teste", mode: "test", kyc_status: "approved" }));
fake.get("/v1/webhook_endpoints", (_req, res) =>
  res.json({ object: "list", data: [{ id: "we_1", url: "https://loja.com/hook", events: ["payment.paid"], active: true }] }));
fake.post("/v1/webhook_endpoints", (req, res) => {
  assert.deepEqual(req.body.events, ["payment.paid", "payment.failed"]);
  res.status(201).json({ id: "we_2", url: req.body.url, events: req.body.events, secret: "whsec_abc" });
});
// Escopo faltando: é assim que o /v1 responde depois do requireScope.
fake.delete("/v1/webhook_endpoints/:id", (_req, res) =>
  res.status(403).json({ error: { type: "invalid_request_error", code: "insufficient_scope", message: "Esta credencial não tem o escopo 'webhooks:write'." } }));
const api = fake.listen(API_PORT);

/* ------------------------- sobe o MCP ------------------------------------- */
const mcp = spawn(process.execPath, ["server.mjs"], {
  cwd: import.meta.dirname,
  env: { ...process.env, PORT: String(MCP_PORT), PYXGATE_API_URL: `http://127.0.0.1:${API_PORT}`, MCP_PUBLIC_URL: RESOURCE, PYXGATE_API_KEY: "" },
  stdio: "inherit",
});
for (let i = 0; i < 60; i++) {
  try { await fetch(RESOURCE, { method: "POST" }); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
}

/* ------------------------- OAuth: descoberta ------------------------------ */
const unauth = await fetch(RESOURCE, { method: "POST" });
assert.equal(unauth.status, 401, "sem credencial tem que dar 401");
const challenge = unauth.headers.get("www-authenticate");
assert.match(challenge, /^Bearer resource_metadata="http:\/\/127\.0\.0\.1:4445\/\.well-known\/oauth-protected-resource"$/,
  `WWW-Authenticate ausente ou malformado: ${challenge}`);

const meta = await (await fetch(`http://127.0.0.1:${MCP_PORT}/.well-known/oauth-protected-resource`)).json();
assert.equal(meta.resource, RESOURCE);
assert.deepEqual(meta.authorization_servers, [`http://127.0.0.1:${API_PORT}`]);
assert.ok(meta.scopes_supported.includes("payments:write"));

/* ------------------------- sessão MCP ------------------------------------- */
const client = new Client({ name: "self-check", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(RESOURCE), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));

const { tools } = await client.listTools();
assert.deepEqual(tools.map((t) => t.name).sort(), [
  "atualizar_webhook", "consultar_conta", "consultar_pagamento", "criar_cobranca_pix",
  "criar_webhook", "listar_pagamentos", "listar_webhooks", "remover_webhook", "simular_pagamento",
]);
// Anotações guiam o cliente a pedir confirmação — se sumirem, o agente passa
// a criar cobrança sem avisar ninguém.
assert.equal(tools.find((t) => t.name === "consultar_pagamento").annotations.readOnlyHint, true);
assert.equal(tools.find((t) => t.name === "criar_cobranca_pix").annotations.readOnlyHint, false);
assert.equal(tools.find((t) => t.name === "remover_webhook").annotations.destructiveHint, true);

const { prompts } = await client.listPrompts();
assert.deepEqual(prompts.map((p) => p.name).sort(), ["checklist_producao", "diagnosticar_pagamento", "integrar_checkout_pix"]);
const roteiro = await client.getPrompt({ name: "integrar_checkout_pix", arguments: { stack: "Next.js" } });
assert.match(roteiro.messages[0].content.text, /Next\.js/);

/* ------------------------- QR Code (o teste prático) ---------------------- */
const r = await client.callTool({
  name: "criar_cobranca_pix",
  arguments: { valor_centavos: 1990, nome: "Maria Compradora", email: "maria@example.com", documento: "39053344705", pedido_id: "pedido-1001" },
});
assert.equal(r.isError, undefined, JSON.stringify(r.content));
const img = r.content.find((c) => c.type === "image");
assert.ok(img && img.mimeType === "image/png", "faltou a imagem do QR");
const png = Buffer.from(img.data, "base64");
assert.equal(png.subarray(1, 4).toString(), "PNG");
assert.ok(png.length > 500, "QR pequeno demais pra ser real (o 1x1 do modo teste)");
const txt = r.content.find((c) => c.type === "text").text;
assert.ok(txt.includes(EMV), "faltou o copia-e-cola");
assert.match(txt, /Modo teste/, "faltou o aviso de modo teste");
assert.equal(r.structuredContent.id, "pay_abc123");

/* ------------------------- demais tools ----------------------------------- */
assert.match((await client.callTool({ name: "consultar_pagamento", arguments: { id: "pay_abc123" } })).content[0].text, /paid — R\$\s?19,90/);
assert.match((await client.callTool({ name: "listar_pagamentos", arguments: { status: "paid" } })).content[0].text, /1 pagamento\(s\)/);
assert.match((await client.callTool({ name: "consultar_conta", arguments: {} })).content[0].text, /Loja Teste/);
assert.match((await client.callTool({ name: "listar_webhooks", arguments: {} })).content[0].text, /we_1/);
assert.match((await client.callTool({ name: "criar_webhook", arguments: { url: "https://loja.com/h", eventos: ["payment.paid", "payment.failed"] } })).content[0].text, /whsec_abc/);

// Erro de escopo chega como isError legível, não como exceção de transporte.
const semEscopo = await client.callTool({ name: "remover_webhook", arguments: { id: "we_1" } });
assert.equal(semEscopo.isError, true);
assert.match(semEscopo.content[0].text, /escopo 'webhooks:write'.*autorize novamente/s);

assert.ok(seen.includes("POST /v1/payments") && seen.includes("GET /v1/account"), "chamadas não chegaram na API");

console.log(`✅ MCP ok: 9 tools, 3 prompts, QR PNG (${png.length}B), OAuth 401+discovery, escopo negado tratado.`);
await client.close();
mcp.kill();
api.close();
