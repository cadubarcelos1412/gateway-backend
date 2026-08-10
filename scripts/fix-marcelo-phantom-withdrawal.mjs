// Correção pontual: remove a reserva fantasma de R$800 (method:"manual",
// sem originTransactionId) da wallet do Marcelo — saque já feito
// manualmente por fora do sistema, essa entrada só existia por causa do bug
// em CashoutService.createCashout (corrigido em 2026-08-10) e ia virar
// crédito duplicado quando a liberação automática achasse availableIn no
// passado. Não mexe em wallet.balance.available — o valor já estava
// corretamente debitado de lá desde a criação da solicitação.
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Wallets = mongoose.connection.collection("wallets");

const user = await Users.findOne({ email: "tiosnoopimports@gmail.com" });
const wallet = await Wallets.findOne({ userId: user._id });

console.log("Antes:");
console.log(`  available: R$${wallet.balance.available}`);
console.log(`  unAvailable: ${wallet.balance.unAvailable.length} entradas`);
for (const e of wallet.balance.unAvailable) {
  console.log(`    - R$${e.amount} | method=${e.method} | originTransactionId=${e.originTransactionId || "(nenhum)"}`);
}

const before = wallet.balance.unAvailable.length;
const filtered = wallet.balance.unAvailable.filter(
  (e) => !(e.method === "manual" && !e.originTransactionId)
);
const removed = before - filtered.length;

if (removed === 0) {
  console.log("\nNenhuma entrada fantasma encontrada — nada a fazer.");
  await mongoose.disconnect();
  process.exit(0);
}

await Wallets.updateOne({ _id: wallet._id }, { $set: { "balance.unAvailable": filtered } });

console.log(`\n✅ Removidas ${removed} entrada(s) fantasma. available não foi alterado (permanece R$${wallet.balance.available}).`);

await mongoose.disconnect();
