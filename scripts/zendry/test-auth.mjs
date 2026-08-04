// Testa autenticação: POST /auth/generate_token (Basic Auth → Bearer token).
// Sem efeito colateral (não cria nada). Rodar: node test-auth.mjs
//
// Equivalente em curl:
//   curl -s -X POST https://api.zendry.com.br/auth/generate_token \
//     -H "Authorization: Basic $(echo -n "$ZENDRY_CLIENT_ID:$ZENDRY_CLIENT_SECRET" | base64)" \
//     -H "Content-Type: application/json" \
//     -d '{"grant_type":"client_credentials"}'

const BASE = "https://api.zendry.com.br";
const CLIENT_ID = process.env.ZENDRY_CLIENT_ID;
const CLIENT_SECRET = process.env.ZENDRY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Defina ZENDRY_CLIENT_ID e ZENDRY_CLIENT_SECRET no ambiente antes de rodar.");
  process.exit(1);
}

const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

const res = await fetch(`${BASE}/auth/generate_token`, {
  method: "POST",
  headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
  body: JSON.stringify({ grant_type: "client_credentials" }),
});

console.log("Status:", res.status);
const json = await res.json();
console.log("Resposta:", { ...json, access_token: json.access_token ? json.access_token.slice(0, 12) + "..." : undefined });

if (res.status === 200 && json.access_token) {
  console.log("\nOK — autenticação funcionando. expires_in:", json.expires_in, "segundos.");
} else {
  console.log("\nFALHOU — confira ZENDRY_CLIENT_ID / ZENDRY_CLIENT_SECRET.");
  process.exit(1);
}
