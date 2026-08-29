// Testes de resolveSellerAcquirer — função pura (sem banco/rede), por isso
// dá pra testar com node:test/node:assert nativos do Node 18+, sem precisar
// de framework novo (ver plano "Adquirente por método", 2026-08-30).
//
// Rodar: npm run build && npm test (ver package.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSellerAcquirer } from "./index";

test("acquirerConfig ausente/undefined → cai pro Seller.acquirer antigo (sellers legados não mudam de comportamento)", () => {
  const legacySeller = { acquirer: "zendry" as const };
  assert.equal(resolveSellerAcquirer(legacySeller, "pix"), "zendry");
  assert.equal(resolveSellerAcquirer(legacySeller, "card"), "zendry");
  assert.equal(resolveSellerAcquirer(legacySeller, "swap"), "zendry");
});

test("acquirerConfig presente mas SEM a capability específica → também cai pro campo antigo", () => {
  const seller = { acquirer: "sttart" as const, acquirerConfig: { pix: "zendry" as const } };
  // "pix" foi configurado explicitamente...
  assert.equal(resolveSellerAcquirer(seller, "pix"), "zendry");
  // ...mas "card" e "swap" nunca foram tocados nessa tela nova, então caem pro antigo.
  assert.equal(resolveSellerAcquirer(seller, "card"), "sttart");
  assert.equal(resolveSellerAcquirer(seller, "swap"), "sttart");
});

test('capability = null explícito → método DESLIGADO, lança erro (nunca resolve pro campo antigo por acidente)', () => {
  const seller = { acquirer: "zendry" as const, acquirerConfig: { card: null } };
  assert.throws(() => resolveSellerAcquirer(seller, "card"), /não está habilitado/);
  // Confirma que o erro é específico do método certo (mensagem menciona "Cartão").
  assert.throws(() => resolveSellerAcquirer(seller, "card"), /Cartão/);
});

test('capability = "zendry"/"sttart" explícito → usa exatamente esse valor, ignora o campo antigo', () => {
  const seller = { acquirer: "zendry" as const, acquirerConfig: { pix: "sttart" as const } };
  assert.equal(resolveSellerAcquirer(seller, "pix"), "sttart");
});

test("sem acquirer nem acquirerConfig nenhum → default final é zendry (nunca undefined/erro silencioso)", () => {
  assert.equal(resolveSellerAcquirer({}, "pix"), "zendry");
});
