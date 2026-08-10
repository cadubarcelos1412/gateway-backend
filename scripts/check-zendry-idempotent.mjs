// Read-only: consulta a Zendry por idempotent_id pra saber se um pedido de
// saque em Pix sequer chegou até eles (endpoint "Consult Payment -
// Idempotent", GET — não manda dinheiro, só consulta).
import "dotenv/config";

const ZENDRY_BASE = "https://api.zendry.com.br";
const idempotentId = process.argv[2];

if (!idempotentId) {
  console.error("Uso: node scripts/check-zendry-idempotent.mjs <idempotent_id>");
  process.exit(1);
}

async function getToken() {
  const basic = Buffer.from(`${process.env.ZENDRY_CLIENT_ID}:${process.env.ZENDRY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${ZENDRY_BASE}/auth/generate_token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Auth falhou: ${JSON.stringify(json)}`);
  return json.access_token;
}

const token = await getToken();

for (const path of [
  `/v1/pix/payments/idempotent/${idempotentId}`,
  `/v1/pix/payments?idempotent_id=${idempotentId}`,
]) {
  const res = await fetch(`${ZENDRY_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  console.log(`GET ${path} -> HTTP ${res.status}`);
  console.log(text.slice(0, 500));
  console.log("---");
}
