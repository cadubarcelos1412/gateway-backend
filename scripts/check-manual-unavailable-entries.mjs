// Read-only: acha reservas "manual" sem originTransactionId em qualquer
// wallet — só existem por causa do bug em CashoutService.createCashout
// (trava o valor da solicitação de saque com timer de 3 dias que nunca é
// desfeito nem por approveCashout nem por rejectCashout). Cada uma dessas
// vai virar crédito automático DUPLICADO quando a varredura de liberação
// (wallet.service.ts) achar availableIn no passado.
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Wallets = mongoose.connection.collection("wallets");
const Users = mongoose.connection.collection("users");

const wallets = await Wallets.find({ "balance.unAvailable.method": "manual" }).toArray();
console.log(`Wallets com reserva "manual": ${wallets.length}\n`);

let totalAmount = 0;
let totalEntries = 0;

for (const w of wallets) {
  const user = await Users.findOne({ _id: w.userId });
  for (const e of w.balance.unAvailable) {
    if (e.method !== "manual") continue;
    totalEntries++;
    totalAmount += e.amount;
    console.log(
      `- ${user?.email || w.userId} | R$${e.amount} | availableIn=${e.availableIn} | originTransactionId=${e.originTransactionId || "(nenhum)"}`
    );
  }
}

console.log(`\nTotal: ${totalEntries} reservas, R$${totalAmount.toFixed(2)} que iriam virar crédito duplicado.`);

await mongoose.disconnect();
