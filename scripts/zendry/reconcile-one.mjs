// Reconciliação manual de UMA transação: confirma o status real na Zendry e,
// se pago, entrega ao nosso PRÓPRIO endpoint de webhook o mesmo evento que a
// Zendry deveria ter mandado — usa o caminho de código real (idempotente,
// audita em ZendryWebhookEvent), não edita o banco na mão.
// Rodar: node scripts/zendry/reconcile-one.mjs <reference_code>
import "dotenv/config";

const ZENDRY_BASE = "https://api.zendry.com.br";
const OUR_WEBHOOK_URL = process.argv[3] || "https://pyxgate-api.onrender.com/api/transactions/webhook/zendry";
const referenceCode = process.argv[2];

if (!referenceCode) {
  console.error("Uso: node scripts/zendry/reconcile-one.mjs <reference_code> [webhook_url]");
  process.exit(1);
}

async function getZendryToken() {
  const basic = Buffer.from(`${process.env.ZENDRY_CLIENT_ID}:${process.env.ZENDRY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${ZENDRY_BASE}/auth/generate_token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  return (await res.json()).access_token;
}

async function findQrcode(token, referenceCode) {
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`${ZENDRY_BASE}/v1/pix/qrcodes?page=${page}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    const found = (json.qrcodes || []).find((q) => q.reference_code === referenceCode);
    if (found) return found;
    if (page >= (json.meta?.total_pages || 1)) break;
  }
  return null;
}

const token = await getZendryToken();
const qr = await findQrcode(token, referenceCode);

if (!qr) {
  console.log("Não encontrado na Zendry.");
  process.exit(1);
}

console.log("Encontrado na Zendry:", { status: qr.status, payment_date: qr.payment_date, value_cents: qr.value_cents });

if (qr.status !== "paid") {
  console.log(`Status não é "paid" (é "${qr.status}") — não vou disparar o webhook. Nada a fazer.`);
  process.exit(0);
}

const key = process.env.ZENDRY_WEBHOOK_SECRET;
if (!key) {
  console.error("ZENDRY_WEBHOOK_SECRET não configurado localmente — não dá pra montar a URL autenticada.");
  process.exit(1);
}

const payload = {
  notification_type: "pix_qrcode",
  message: {
    reference_code: qr.reference_code,
    status: qr.status,
    payment_date: qr.payment_date,
  },
};

console.log("\nEnviando pro nosso próprio webhook:", OUR_WEBHOOK_URL);
const res = await fetch(`${OUR_WEBHOOK_URL}?key=${encodeURIComponent(key)}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const text = await res.text();
console.log("Resposta:", res.status, text);
