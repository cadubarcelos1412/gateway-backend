// Simula uma notificação de webhook chegando no SEU endpoint (não fala com a
// Zendry — só testa se o SEU código aceita/rejeita corretamente). Ajuste
// TARGET_URL pro seu endpoint local ou deployado.
//
// Rodar: TARGET_URL=http://localhost:3000/api/transactions/webhook/zendry \
//        ZENDRY_WEBHOOK_SECRET=... node test-webhook.mjs

const TARGET_URL = process.env.TARGET_URL || "http://localhost:3000/api/transactions/webhook/zendry";
const SECRET = process.env.ZENDRY_WEBHOOK_SECRET;

if (!SECRET) {
  console.error("Defina ZENDRY_WEBHOOK_SECRET no ambiente antes de rodar.");
  process.exit(1);
}

async function send(label, url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log(`\n[${label}] Status: ${res.status}`);
  console.log(await res.text());
}

// 1) Chave errada — deve retornar 401
await send("chave inválida (esperado: 401)", `${TARGET_URL}?key=chave-errada`, {
  notification_type: "pix_qrcode",
  message: { reference_code: "test-ref-123", status: "paid" },
});

// 2) Chave certa, payload de Pix pago — deve retornar 200 { ok: true }
await send("Pix pago, chave correta (esperado: 200)", `${TARGET_URL}?key=${SECRET}`, {
  notification_type: "pix_qrcode",
  message: {
    reference_code: "test-ref-123", // não existe no banco de teste — vai retornar ok mesmo sem achar o pagamento
    status: "paid",
    payment_date: new Date().toISOString(),
  },
});

// 3) Chave certa, payload de cartão pago
await send("Cartão aceito, chave correta (esperado: 200)", `${TARGET_URL}?key=${SECRET}`, {
  notification_type: "card_payment",
  message: {
    muid: "test-muid-456",
    status: "accepted",
  },
});

console.log("\nSe o teste 1 não retornou 401, ou os testes 2/3 não retornaram 200, revise a rota antes de ir pra produção.");
