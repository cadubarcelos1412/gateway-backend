// Read-only: quanto dinheiro de retenção de risco já foi "perdido" (nunca
// devolvido) em transações aprovadas reais, pra medir o impacto de verdade
// do bug antes de decidir prioridade de correção.
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Transactions = mongoose.connection.collection("transactions");

const approved = await Transactions.find({ status: "approved", mode: "live" }).toArray();
console.log(`Transações live aprovadas: ${approved.length}`);

let totalRetention = 0;
let countWithRetention = 0;
for (const t of approved) {
  if (t.retention && t.retention > 0) {
    countWithRetention++;
    totalRetention += t.retention;
  }
}
console.log(`Transações com retenção > 0: ${countWithRetention}`);
console.log(`Total retido nunca devolvido: R$${totalRetention.toFixed(2)}`);

await mongoose.disconnect();
