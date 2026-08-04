// ============================================================================
// ATENÇÃO: isso cria uma cobrança de cartão REAL contra produção (não existe
// sandbox confirmado pra essa API). NÃO RODE sem autorização explícita do
// dono da conta, e só com um cartão de teste de baixo valor.
//
// Além disso, este script SOZINHO não é suficiente pra testar cartão de
// ponta a ponta: a Zendry recusa qualquer pagamento sem `threeds_data`
// (confirmado: 422 "Threeds data is required"), e esse dado só existe depois
// de rodar o desafio 3DS de verdade NO NAVEGADOR (ZendrySDKThreeds.init_threeds
// — não é simulável por script). Ou seja: rodar este script como está vai
// SEMPRE falhar com "Threeds data is required" — isso é esperado e serve pra
// confirmar que a validação de 3DS obrigatório está mesmo ativa na sua conta.
// Um teste de cartão completo exige abrir a tela de pagamento de verdade num
// navegador, com um cartão real, e passar pelo desafio 3DS.
// ============================================================================

const BASE = "https://api.zendry.com.br";
const CLIENT_ID = process.env.ZENDRY_CLIENT_ID;
const CLIENT_SECRET = process.env.ZENDRY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Defina ZENDRY_CLIENT_ID e ZENDRY_CLIENT_SECRET no ambiente antes de rodar.");
  process.exit(1);
}

if (process.env.CONFIRM_REAL_CARD_TEST !== "sim") {
  console.error(
    "Defina CONFIRM_REAL_CARD_TEST=sim explicitamente pra confirmar que você quer " +
    "rodar um teste de cartão real (ou aceitar o 422 esperado de 3DS ausente)."
  );
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

// Preencha com um cartão de teste de baixo valor antes de rodar — NUNCA
// commite dados de cartão real neste arquivo.
const res = await fetch(`${BASE}/v1/card_payments`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    card_payment: {
      external_id: "test-migration-card-" + Date.now(),
      amount: 100, // R$ 1,00
      currency: "BRL",
      payment_type: "CREDIT",
      card_number: "0000000000000000", // TODO: preencha com um cartão de teste
      card_expiration_date: "122099", // TODO: MMyyyy
      card_security_code: "000", // TODO
      card_holder_name: "TESTE MIGRACAO",
      card_holder_document: "39212772307",
      installments: 1,
      // threeds_data omitido de propósito — confirma que a API recusa sem 3DS.
    },
  }),
});

console.log("Status:", res.status);
console.log(await res.text());
console.log(
  '\nSe o status foi 422 com "Threeds data is required", é o comportamento ' +
  "esperado sem 3DS — confirma que a conta exige 3DS. Pra um teste completo, " +
  "use a tela de pagamento real no navegador."
);
