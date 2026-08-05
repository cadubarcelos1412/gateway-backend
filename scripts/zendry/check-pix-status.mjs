// Consulta o status real de uma cobrança Pix na Zendry por reference_code —
// GET puro, não altera nada.
// Rodar: node scripts/zendry/check-pix-status.mjs <reference_code>
import "dotenv/config";

const BASE = "https://api.zendry.com.br";
const CLIENT_ID = process.env.ZENDRY_CLIENT_ID;
const CLIENT_SECRET = process.env.ZENDRY_CLIENT_SECRET;
const referenceCode = process.argv[2];

if (!referenceCode) {
  console.error("Uso: node scripts/zendry/check-pix-status.mjs <reference_code>");
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

const res = await fetch(`${BASE}/v1/pix/qrcodes?reference_code=${encodeURIComponent(referenceCode)}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const text = await res.text();
let json;
try { json = JSON.parse(text); } catch { json = text; }
console.log("Status HTTP:", res.status);
console.log(JSON.stringify(json, null, 2));
