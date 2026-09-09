// Testes das primitivas de segurança do OAuth — funções puras (sem banco/
// rede), no mesmo padrão de resolveSellerAcquirer.test.ts: node:test nativo,
// sem framework novo.
//
// O que está coberto aqui é exatamente o que, se quebrar, vira falha de
// autenticação silenciosa: PKCE, audiência do token, expiração e escopos.
//
// Rodar: npm run build && npm test (ver package.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

process.env.SECRET_TOKEN ||= "test-secret-para-os-testes";
process.env.ISSUER ||= "gateway-test";

import {
  DEFAULT_SCOPES,
  allowedResources,
  generateOpaqueSecret,
  hashSecret,
  mintAccessToken,
  parseScopes,
  timingSafeEqualHex,
  verifyAccessToken,
  verifyPkceS256,
} from "./oauthTokens";

const RESOURCE = "https://mcp.pyxgate.com/mcp";

const mint = (over: Partial<Parameters<typeof mintAccessToken>[0]> = {}) =>
  mintAccessToken({
    merchantId: "68f29b8a1100e7bb3652f44f",
    clientId: "pyx_client_abc",
    mode: "test",
    scopes: ["payments:read"],
    audience: RESOURCE,
    ...over,
  });

/* ------------------------------ PKCE ------------------------------------- */

test("PKCE S256: verifier correto valida, verifier errado não", () => {
  const verifier = generateOpaqueSecret(32);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(verifyPkceS256(generateOpaqueSecret(32), challenge), false);
});

test("PKCE S256: challenge de tamanho diferente não estoura, só recusa", () => {
  // timingSafeEqual lança se os buffers têm tamanhos diferentes — o guard de
  // length tem que vir antes, senão um challenge malformado derruba a rota.
  assert.doesNotThrow(() => verifyPkceS256(generateOpaqueSecret(32), "curto"));
  assert.equal(verifyPkceS256(generateOpaqueSecret(32), "curto"), false);
});

/* --------------------------- Access token -------------------------------- */

test("access token: round-trip preserva merchant, cliente, modo e escopos", () => {
  const claims = verifyAccessToken(mint({ scopes: ["payments:read", "payments:write"] }), RESOURCE);

  assert.ok(claims);
  assert.equal(claims!.sub, "68f29b8a1100e7bb3652f44f");
  assert.equal(claims!.cid, "pyx_client_abc");
  assert.equal(claims!.mode, "test");
  assert.deepEqual(claims!.scope.split(" "), ["payments:read", "payments:write"]);
});

test("access token: audiência errada é recusada (RFC 8707)", () => {
  // Sem essa checagem, um token emitido pra outro recurso da mesma
  // instalação seria aceito no /v1.
  assert.equal(verifyAccessToken(mint(), "https://outro-recurso.com/mcp"), null);
});

test("access token: assinatura de outro segredo é recusada", () => {
  const jwt = require("jsonwebtoken");
  const forjado = jwt.sign({ sub: "x", cid: "y", mode: "live", scope: "payments:write" }, "segredo-do-atacante", {
    issuer: process.env.ISSUER,
    audience: RESOURCE,
    expiresIn: 3600,
  });
  assert.equal(verifyAccessToken(forjado, RESOURCE), null);
});

test("access token: expirado é recusado", () => {
  const jwt = require("jsonwebtoken");
  const vencido = jwt.sign({ sub: "x", cid: "y", mode: "test", scope: "payments:read" }, process.env.SECRET_TOKEN, {
    issuer: process.env.ISSUER,
    audience: RESOURCE,
    expiresIn: -10,
  });
  assert.equal(verifyAccessToken(vencido, RESOURCE), null);
});

test("access token: lixo não estoura, só devolve null", () => {
  assert.equal(verifyAccessToken("nao-e-um-jwt", RESOURCE), null);
  assert.equal(verifyAccessToken("", RESOURCE), null);
});

/* ------------------------------ Escopos ---------------------------------- */

test("parseScopes só deixa passar escopo conhecido — nada de curinga por token OAuth", () => {
  assert.deepEqual(parseScopes("payments:read payments:write"), ["payments:read", "payments:write"]);
  assert.deepEqual(parseScopes("payments:read admin:tudo *"), ["payments:read"]);
  assert.deepEqual(parseScopes(""), []);
  assert.deepEqual(parseScopes(undefined), []);
});

test("escopos default não incluem escrita de webhook", () => {
  assert.equal(DEFAULT_SCOPES.includes("webhooks:write" as never), false);
});

/* ------------------------------ Segredos --------------------------------- */

test("segredos opacos são únicos e guardados só como hash", () => {
  const a = generateOpaqueSecret(32);
  const b = generateOpaqueSecret(32);
  assert.notEqual(a, b);
  assert.equal(hashSecret(a).length, 64); // sha-256 em hex
  assert.equal(hashSecret(a), hashSecret(a));
  assert.notEqual(hashSecret(a), hashSecret(b));
});

test("timingSafeEqualHex: iguais true, diferentes false, tamanhos distintos não estouram", () => {
  const h = hashSecret("qualquer");
  assert.equal(timingSafeEqualHex(h, h), true);
  assert.equal(timingSafeEqualHex(h, hashSecret("outro")), false);
  assert.doesNotThrow(() => timingSafeEqualHex(h, "ab"));
  assert.equal(timingSafeEqualHex(h, "ab"), false);
});

/* --------------------------- Recursos (RFC 8707) -------------------------- */

test("allowedResources: CSV, trim e barra final normalizada", () => {
  const antes = process.env.MCP_RESOURCE_URL;
  process.env.MCP_RESOURCE_URL = " https://mcp.pyxgate.com/mcp/ , https://outro.pyxgate.com/mcp ";
  assert.deepEqual(allowedResources(), ["https://mcp.pyxgate.com/mcp", "https://outro.pyxgate.com/mcp"]);
  process.env.MCP_RESOURCE_URL = antes;
});

test("token vale para qualquer recurso da lista, e só para eles", () => {
  const antes = process.env.MCP_RESOURCE_URL;
  process.env.MCP_RESOURCE_URL = "https://a.pyxgate.com/mcp,https://b.pyxgate.com/mcp";

  const paraA = mint({ audience: "https://a.pyxgate.com/mcp" });
  assert.ok(verifyAccessToken(paraA, allowedResources()), "token de recurso conhecido deveria valer");

  const paraTerceiro = mint({ audience: "https://evil.com/mcp" });
  assert.equal(verifyAccessToken(paraTerceiro, allowedResources()), null, "token de recurso fora da lista não pode valer");

  process.env.MCP_RESOURCE_URL = antes;
});
