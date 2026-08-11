// Read-only: investiga a reclamação do usuário de que o saldo interno da
// PyxGate fica maior que o saldo real na Zendry — sinal de que a taxa de
// Pix (in e/ou out) não está sendo abatida em algum ponto do fluxo.
// Rodar: node scripts/check-pix-fee-reconciliation.mjs [email]
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);

const email = process.argv[2] || "tiosnoopimports@gmail.com";

const Users = mongoose.connection.collection("users");
const Sellers = mongoose.connection.collection("sellers");
const Transactions = mongoose.connection.collection("transactions");
const CashoutRequests = mongoose.connection.collection("cashoutrequests");
const SystemFeeConfig = mongoose.connection.collection("systemfeeconfigs");
const Wallets = mongoose.connection.collection("wallets");

const user = await Users.findOne({ email });
if (!user) {
  console.log(`Usuário ${email} não encontrado.`);
  process.exit(0);
}

const seller = await Sellers.findOne({ userId: user._id });
const wallet = await Wallets.findOne({ userId: user._id });
const defaultConfig = await SystemFeeConfig.findOne({ key: "default" });

console.log(`=== ${email} ===`);
console.log("\n--- Fee table ---");
console.log("Seller tem feeTable próprio?", Boolean(seller?.feeTable));
console.log(
  "pixIn.percentage efetivo:",
  seller?.feeTable?.pixIn?.percentage ?? defaultConfig?.feeTable?.pixIn?.percentage ?? "(sem fallback)"
);
console.log(
  "pixOut:",
  JSON.stringify(seller?.feeTable?.pixOut || defaultConfig?.feeTable?.pixOut || "(sem fallback)")
);

console.log("\n--- Saldo atual na wallet ---");
console.log("available:", wallet?.balance?.available);
console.log("unAvailable entradas:", wallet?.balance?.unAvailable?.length || 0);

console.log("\n--- Últimas 10 transações Pix aprovadas (venda) ---");
const pixTx = await Transactions.find({ userId: user._id, method: "pix", type: "deposit" })
  .sort({ createdAt: -1 })
  .limit(10)
  .toArray();
for (const t of pixTx) {
  console.log(
    `${t.createdAt.toISOString().slice(0, 10)} | status=${t.status} | amount=${t.amount} | fee=${t.fee} | netAmount=${t.netAmount} | creditedAt=${t.creditedAt ? "sim" : "não"}`
  );
}

console.log("\n--- Últimos 10 saques (cashout) ---");
const cashouts = await CashoutRequests.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).toArray();
for (const c of cashouts) {
  console.log(
    `${c.createdAt.toISOString().slice(0, 10)} | status=${c.status} | rail=${c.rail} | amount=${c.amount} | providerStatus=${c.providerStatus || "-"} | externalReference=${c.externalReference || "-"}`
  );
}

await mongoose.disconnect();
