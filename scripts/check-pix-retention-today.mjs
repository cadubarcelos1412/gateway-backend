// Read-only: investiga transações Pix recentes do Marcelo (tiosnoopimports)
// pra achar por que uma reserva de Pix está com availableIn no futuro,
// mesmo depois do fix que trava Pix em D+0.
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Transactions = mongoose.connection.collection("transactions");
const Wallets = mongoose.connection.collection("wallets");

const user = await Users.findOne({ email: "tiosnoopimports@gmail.com" });
console.log(`Seller: ${user.name} (${user._id})\n`);

const wallet = await Wallets.findOne({ userId: user._id });
console.log("Reservas (unAvailable) na wallet AGORA:");
for (const e of wallet?.balance?.unAvailable || []) {
  console.log(`  R$${e.amount} | availableIn=${e.availableIn} | method=${e.method} | originTransactionId=${e.originTransactionId}`);
}

console.log("\nTransações Pix recentes (últimas 10), mais nova primeiro:");
const recent = await Transactions.find({ userId: user._id, method: "pix" })
  .sort({ createdAt: -1 })
  .limit(10)
  .toArray();

for (const t of recent) {
  console.log(
    `- ${t._id} | status=${t.status} | createdAt=${t.createdAt} | retentionDays=${t.retentionDays} | retention=${t.retention} | creditedAt=${t.creditedAt || "-"} | netAmount=${t.netAmount}`
  );
}

await mongoose.disconnect();
