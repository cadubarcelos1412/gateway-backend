import "dotenv/config";
const ZENDRY_BASE = "https://api.zendry.com.br";
async function getToken() {
  const basic = Buffer.from(`${process.env.ZENDRY_CLIENT_ID}:${process.env.ZENDRY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${ZENDRY_BASE}/auth/generate_token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  const json = await res.json();
  return json.access_token;
}
const token = await getToken();
let found = [];
for (let page = 1; page <= 5; page++) {
  const res = await fetch(`${ZENDRY_BASE}/v1/pix/payments?page=${page}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { console.log(`page ${page}: HTTP ${res.status}`); break; }
  const json = await res.json();
  const list = json.payments || json.data || [];
  console.log(`page ${page}: ${list.length} itens | meta=${JSON.stringify(json.meta || {})}`);
  for (const p of list) {
    if (p.value_cents === 300 || (p.registration_date && p.registration_date.startsWith("2026-08-10"))) {
      found.push(p);
    }
  }
  if (list.length === 0) break;
}
console.log("\nMatches (value_cents=300 ou registration_date=2026-08-10):");
console.log(JSON.stringify(found, null, 2));
