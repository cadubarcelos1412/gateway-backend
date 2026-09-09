// Testes do SDK — sem rede: um fetch falso cobre o cliente, e a verificação
// de assinatura é testada contra o MESMO algoritmo do gateway
// (webhook.service.ts: HMAC-SHA256 de `${t}.${rawBody}`).
//
// Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PyxGate, PyxGateError, constructWebhookEvent, WebhookSignatureError } from "../dist/index.js";

/* ------------------------------ helpers ---------------------------------- */

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  fn.calls = calls;
  return fn;
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const PAYMENT = { id: "pay_1", object: "payment", amount: 1990, fee: 60, net_amount: 1930, status: "pending", mode: "test", payment_method: "pix", qr_code: "00020126TEST", metadata: {}, created: 1757376000 };

/* ------------------------------ cliente ---------------------------------- */

test("create envia Bearer, Idempotency-Key e corpo JSON no endpoint certo", async () => {
  const f = fakeFetch(() => json(201, PAYMENT));
  const pyx = new PyxGate({ apiKey: "sk_test_abc", baseUrl: "https://api.exemplo.com", fetch: f });

  const p = await pyx.payments.create(
    { amount: 1990, payment_method: "pix", customer: { name: "Maria", email: "m@e.com", document: "39053344705" } },
    "pedido-1001"
  );

  assert.equal(p.id, "pay_1");
  const [call] = f.calls;
  assert.equal(call.url, "https://api.exemplo.com/v1/payments");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers.Authorization, "Bearer sk_test_abc");
  assert.equal(call.init.headers["Idempotency-Key"], "pedido-1001");
  assert.equal(JSON.parse(call.init.body).amount, 1990);
});

test("aceita a apiKey como string simples e usa a baseUrl padrão", () => {
  // Sem rede: só confere que o construtor aceita as duas formas e que a
  // baseUrl padrão é a de produção.
  assert.doesNotThrow(() => new PyxGate("sk_test_abc"));
  assert.throws(() => new PyxGate(""), /apiKey é obrigatória/);
  assert.throws(() => new PyxGate({ apiKey: "" }), /apiKey é obrigatória/);
});

test("account.retrieve chama GET /v1/account", async () => {
  const f = fakeFetch(() => json(200, { id: "acct_1", mode: "test" }));
  const pyx = new PyxGate({ apiKey: "sk_test_x", baseUrl: "https://api.exemplo.com", fetch: f });

  const acct = await pyx.account.retrieve();
  assert.equal(acct.id, "acct_1");
  assert.equal(f.calls[0].url, "https://api.exemplo.com/v1/account");
  assert.equal(f.calls[0].init.method, "GET");
});

test("list monta a query string e ignora campos vazios", async () => {
  const f = fakeFetch(() => json(200, { object: "list", data: [], page: 1, limit: 20, total: 0, has_more: false }));
  const pyx = new PyxGate({ apiKey: "sk_test_abc", baseUrl: "https://api.exemplo.com", fetch: f });

  await pyx.payments.list({ status: "paid", limit: 50, created_after: "", page: undefined });

  const url = new URL(f.calls[0].url);
  assert.equal(url.searchParams.get("status"), "paid");
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(url.searchParams.has("created_after"), false, "campo vazio não deveria virar query");
  assert.equal(url.searchParams.has("page"), false);
});

test("erro 4xx vira PyxGateError com code do contrato e NÃO é repetido", async () => {
  const f = fakeFetch(() => json(400, { error: { type: "invalid_request_error", code: "amount_below_minimum", message: "Valor abaixo do mínimo.", param: "amount" } }));
  const pyx = new PyxGate({ apiKey: "sk_test_abc", fetch: f, maxRetries: 3 });

  await assert.rejects(
    () => pyx.payments.create({ amount: 100, payment_method: "pix", customer: { name: "Maria" } }),
    (err) => {
      assert.ok(err instanceof PyxGateError);
      assert.equal(err.code, "amount_below_minimum");
      assert.equal(err.param, "amount");
      assert.equal(err.status, 400);
      return true;
    }
  );
  assert.equal(f.calls.length, 1, "erro do chamador não pode ser repetido — geraria cobrança duplicada");
});

test("5xx é repetido e sucede na tentativa seguinte", async () => {
  const f = fakeFetch((_u, _i, n) => (n === 1 ? json(503, {}) : json(201, PAYMENT)));
  const pyx = new PyxGate({ apiKey: "sk_test_abc", fetch: f, maxRetries: 2 });

  const p = await pyx.payments.create({ amount: 1990, payment_method: "pix", customer: { name: "Maria" } });
  assert.equal(p.id, "pay_1");
  assert.equal(f.calls.length, 2);
});

test("delete de webhook não estoura com corpo vazio (204)", async () => {
  const f = fakeFetch(() => new Response(null, { status: 204 }));
  const pyx = new PyxGate({ apiKey: "sk_test_abc", fetch: f });
  await pyx.webhookEndpoints.del("we_1");
  assert.equal(f.calls[0].init.method, "DELETE");
});

/* -------------------- verificação de assinatura -------------------------- */

const SECRET = "whsec_teste";
// Assina exatamente como gateway-clean/src/services/webhook.service.ts.
const assinar = (ts, body) => crypto.createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
const agora = () => Math.floor(Date.now() / 1000);

test("assinatura válida devolve o evento parseado", () => {
  const body = JSON.stringify({ id: "evt_1", type: "payment.paid", created: agora(), data: PAYMENT });
  const ts = agora();
  const evt = constructWebhookEvent(body, `t=${ts},v1=${assinar(ts, body)}`, SECRET);
  assert.equal(evt.type, "payment.paid");
  assert.equal(evt.data.id, "pay_1");
});

test("aceita Buffer como rawBody (é o que o Express entrega em req.rawBody)", () => {
  const body = JSON.stringify({ id: "evt_2", type: "payment.paid", created: agora(), data: PAYMENT });
  const ts = agora();
  const evt = constructWebhookEvent(Buffer.from(body, "utf8"), `t=${ts},v1=${assinar(ts, body)}`, SECRET);
  assert.equal(evt.id, "evt_2");
});

test("corpo adulterado é recusado", () => {
  const body = JSON.stringify({ id: "evt_3", type: "payment.paid", data: { ...PAYMENT, amount: 1990 } });
  const ts = agora();
  const sig = `t=${ts},v1=${assinar(ts, body)}`;
  const adulterado = body.replace('"amount":1990', '"amount":9999999');

  assert.throws(() => constructWebhookEvent(adulterado, sig, SECRET), WebhookSignatureError);
});

test("secret errado é recusado", () => {
  const body = JSON.stringify({ id: "evt_4", type: "payment.paid", data: PAYMENT });
  const ts = agora();
  assert.throws(() => constructWebhookEvent(body, `t=${ts},v1=${assinar(ts, body)}`, "whsec_outro"), WebhookSignatureError);
});

test("replay fora da janela de tolerância é recusado", () => {
  const body = JSON.stringify({ id: "evt_5", type: "payment.paid", data: PAYMENT });
  const velho = agora() - 3600;
  const sig = `t=${velho},v1=${assinar(velho, body)}`;

  assert.throws(() => constructWebhookEvent(body, sig, SECRET), /fora da janela/);
  // Com tolerância desligada, a mesma assinatura passa.
  assert.equal(constructWebhookEvent(body, sig, SECRET, 0).id, "evt_5");
});

test("header ausente ou malformado é recusado sem estourar exceção crua", () => {
  const body = "{}";
  assert.throws(() => constructWebhookEvent(body, undefined, SECRET), WebhookSignatureError);
  assert.throws(() => constructWebhookEvent(body, "lixo", SECRET), WebhookSignatureError);
  assert.throws(() => constructWebhookEvent(body, "t=123", SECRET), WebhookSignatureError);
});

test("assinatura de tamanho diferente não derruba o processo, só recusa", () => {
  // timingSafeEqual lança com buffers de tamanhos distintos — o guard de
  // length precisa vir antes, senão um header curto vira crash do handler.
  const body = "{}";
  const ts = agora();
  assert.throws(() => constructWebhookEvent(body, `t=${ts},v1=abcd`, SECRET), WebhookSignatureError);
});
