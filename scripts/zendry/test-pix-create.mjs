// Cria uma cobrança Pix REAL de R$ 1,00 (não há sandbox pra essa API). Não é
// destrutivo — só gera um QR Code que ninguém precisa pagar — mas é uma
// chamada real contra produção. Rodar: node test-pix-create.mjs

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

const res = await fetch(`${BASE}/v1/pix/qrcodes`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    value_cents: 100, // R$ 1,00
    generator_name: "Teste de Migração",
    generator_document: "39212772307", // CPF de teste com dígito verificador válido
    expiration_time: "1800",
    external_reference: "test-migration-" + Date.now(),
  }),
});

console.log("Status:", res.status);
const json = await res.json();

if (res.status === 201 && json.qrcode) {
  console.log("OK — Pix criado:");
  console.log("  reference_code:", json.qrcode.reference_code);
  console.log("  content (copia e cola):", json.qrcode.content.slice(0, 60) + "...");
  console.log("  image_base64: (" + json.qrcode.image_base64.length + " chars)");
} else {
  console.log("FALHOU:", JSON.stringify(json, null, 2));
  process.exit(1);
}
