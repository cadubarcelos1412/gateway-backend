// Consulta os webhooks registrados na conta Zendry — GET puro, não altera nada.
// Rodar: node scripts/zendry/check-webhooks.mjs
import "dotenv/config";

const BASE = "https://api.zendry.com.br";
const CLIENT_ID = process.env.ZENDRY_CLIENT_ID;
const CLIENT_SECRET = process.env.ZENDRY_CLIENT_SECRET;

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

for (const path of ["/v1/webhooks", "/v1/webhooks/pix_qrcode", "/v1/webhooks/card_payment", "/v1/webhooks/checkout"]) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n=== GET ${path} ===`);
  console.log("Status:", res.status);
  console.log(JSON.stringify(json, null, 2));
}
