import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Wallets = mongoose.connection.collection("wallets");

const user = await Users.findOne({ email: "tiosnoopimports@gmail.com" });
const wallet = await Wallets.findOne({ userId: user._id });

console.log(`Total de entradas no log: ${wallet.log.length}`);
let sumTopup = 0, sumWithdraw = 0, sumReversal = 0;
for (const entry of wallet.log) {
  if (entry.type === "topup") sumTopup += entry.amount;
  else if (entry.type === "withdraw") sumWithdraw += entry.amount;
  else if (entry.type === "reversal") sumReversal += entry.amount;
}
console.log(`Soma topup (créditos reais aplicados na wallet): R$${sumTopup.toFixed(2)}`);
console.log(`Soma withdraw (débitos reais aplicados na wallet): R$${sumWithdraw.toFixed(2)}`);
console.log(`Soma reversal: R$${sumReversal.toFixed(2)}`);
console.log(`Saldo esperado (topup - withdraw - reversal) - unAvailable atual: R$${(sumTopup - sumWithdraw - sumReversal - wallet.balance.unAvailable.reduce((s,e)=>s+e.amount,0)).toFixed(2)}`);
console.log(`Available real: R$${wallet.balance.available.toFixed(2)}`);

console.log("\n=== Detalhe do log ===");
wallet.log.sort((a,b)=> new Date(a.security.createdAt) - new Date(b.security.createdAt));
for (const entry of wallet.log) {
  console.log(`${entry.security.createdAt} | type=${entry.type} | method=${entry.method} | amount=${entry.amount} | txId=${entry.transactionId}`);
}

await mongoose.disconnect();
