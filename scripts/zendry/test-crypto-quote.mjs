// Consulta a cotação USDT/BRL da Zendry. Sem efeito colateral (GET puro).
// Rodar: ZENDRY_CLIENT_ID=... ZENDRY_CLIENT_SECRET=... node test-crypto-quote.mjs

const BASE = "https://api.zendry.com.br";
const CLIENT_ID = process.env.ZENDRY_CLIENT_ID;
const CLIENT_SECRET = process.env.ZENDRY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Defina ZENDRY_CLIENT_ID e ZENDRY_CLIENT_SECRET no ambiente antes de rodar.");
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

const res = await fetch(`${BASE}/v1/crypto/quotations/usdt`, {
  headers: { Authorization: `Bearer ${token}` },
});

console.log("Status:", res.status);
const json = await res.json();

if (res.status === 200 && json.brl_price) {
  console.log("OK — Cotação USDT:", json.brl_price, "BRL");
} else {
  console.log("FALHOU:", JSON.stringify(json, null, 2));
  process.exit(1);
}
