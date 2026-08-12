// Devolve o saldo dos 2 saques que ficaram travados hoje (2026-08-12) antes
// da correção existir: um falhou no envio (CPF/tipo de chave não batiam),
// outro foi cancelado pela Zendry depois de aceito. Usa a mesma função que
// agora roda automaticamente pra novos casos (CashoutService.refundFailedPixPayout).
import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);

const { CashoutService } = await import("../dist/services/cashout.service.js");
const CashoutRequests = mongoose.connection.collection("cashoutrequests");
const Wallets = mongoose.connection.collection("wallets");
const Users = mongoose.connection.collection("users");

const user = await Users.findOne({ email: "tiosnoopimports@gmail.com" });
const walletBefore = await Wallets.findOne({ userId: user._id });
console.log("Saldo ANTES:", walletBefore.balance.available);

const stuck = await CashoutRequests.find({
  userId: user._id,
  status: "approved",
  $or: [{ providerStatus: "canceled" }, { providerStatus: { $regex: "^FALHOU" } }],
}).toArray();

console.log(`\nSaques travados encontrados: ${stuck.length}`);
for (const c of stuck) {
  console.log(`- ${c._id.toString()} | amount=${c.amount} | providerStatus=${c.providerStatus}`);
}

for (const c of stuck) {
  await CashoutService.refundFailedPixPayout(c._id, `Backfill manual — ${c.providerStatus}`);
}

const walletAfter = await Wallets.findOne({ userId: user._id });
console.log("\nSaldo DEPOIS:", walletAfter.balance.available);
console.log("Diferença:", (walletAfter.balance.available - walletBefore.balance.available).toFixed(2));

await mongoose.disconnect();
