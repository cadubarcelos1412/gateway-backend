// ⚠️ Cria uma wallet USDT NOVA e PERMANENTE na Zendry. Não é destrutivo (não
// apaga nada), mas NÃO rode isso repetidamente sem necessidade — cada
// chamada gera uma wallet nova, e o objetivo é ter só UMA wallet-tesouro
// (guardar o wallet_id em ZENDRY_TREASURY_WALLET_ID no .env). Essa wallet
// precisa ser fundeada com USDT comprado por fora antes de qualquer saque
// real funcionar — não existe endpoint que converta nosso BRL em USDT.
//
// Rodar: ZENDRY_CLIENT_ID=... ZENDRY_CLIENT_SECRET=... node test-crypto-wallet-create.mjs

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

const res = await fetch(`${BASE}/v1/crypto/wallets`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
});

console.log("Status:", res.status);
const json = await res.json();

if (res.status === 201 && json.crypto_wallet) {
  console.log("OK — Wallet criada:");
  console.log("  wallet_id:", json.crypto_wallet.wallet_id);
  console.log("  address:  ", json.crypto_wallet.address);
  console.log("\nGuarde o wallet_id em ZENDRY_TREASURY_WALLET_ID no .env e fundeie");
  console.log("esse endereço com USDT antes de tentar um saque real.");
} else {
  console.log("FALHOU:", JSON.stringify(json, null, 2));
  process.exit(1);
}
