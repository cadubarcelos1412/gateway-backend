// Cria uma sessão 3DS de teste — NÃO cobra, NÃO move dinheiro (só o passo
// POST /v1/card_payments/threeds, que existe justamente pra iniciar o
// desafio 3DS antes da cobrança real). Descoberto por sondagem empírica
// (contra produção, sem sandbox documentado) em 2026-08-05 — schema de
// payment_form não está em nenhuma doc pública da Zendry.
//
// Rodar: node scripts/zendry/probe-threeds.mjs
import "dotenv/config";

const BASE = "https://api.zendry.com.br";
const CLIENT_ID = process.env.ZENDRY_CLIENT_ID;
const CLIENT_SECRET = process.env.ZENDRY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Defina ZENDRY_CLIENT_ID e ZENDRY_CLIENT_SECRET (.env) antes de rodar.");
  process.exit(1);
}

async function getToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/auth/generate_token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Falha na autenticação (${res.status}): ${JSON.stringify(json)}`);
  return json.access_token;
}

const token = await getToken();

// Schema confirmado por sondagem (ver mensagens de erro INT_902 da própria
// Zendry/Lyra pra cada campo faltando/inválido):
// - payment_form.{pan, expiry_month, expiry_year, card_holder_name, account_type, network_preference} obrigatórios.
// - expiry_year é 2 dígitos ("29"), não 4 ("2029") — a API rejeita 4 dígitos.
// - account_type aceita "CREDIT" ou "DEBIT" (maiúsculo).
// - network_preference aceita "VISA", "MASTERCARD", "AMEX", "CB" (maiúsculo) — testados e confirmados.
// - CVV/security_code NÃO entra aqui — só na cobrança final (POST /v1/card_payments).
const res = await fetch(`${BASE}/v1/card_payments/threeds`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    amount: 15000,
    payment_form: {
      pan: "4242424242424242",
      expiry_month: "12",
      expiry_year: "29",
      card_holder_name: "MARIA COMPRADORA",
      account_type: "CREDIT",
      network_preference: "VISA",
    },
  }),
});

console.log("Status HTTP:", res.status);
console.log(JSON.stringify(await res.json(), null, 2));
