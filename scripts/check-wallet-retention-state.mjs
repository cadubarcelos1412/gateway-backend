// Read-only: mostra reservas (unAvailable) sem "method" (criadas antes do
// campo existir) e, entre elas, quais são de Pix mas ainda aparecem com
// availableIn no futuro — sintoma exato do bug (settlementDays do cartão
// vazando pro Pix).
// Rodar: node scripts/check-wallet-retention-state.mjs
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Wallet = mongoose.connection.collection("wallets");
const Transaction = mongoose.connection.collection("transactions");

const wallets = await Wallet.find({ "balance.unAvailable.0": { $exists: true } }).toArray();
console.log(`Wallets com reservas: ${wallets.length}`);

let totalEntries = 0;
let missingMethod = 0;
let pixLockedWrongly = 0;
let cardLocked = 0;

for (const w of wallets) {
  for (const entry of w.balance.unAvailable) {
    totalEntries++;
    if (entry.method) continue;
    missingMethod++;

    let originMethod = null;
    if (entry.originTransactionId) {
      const tx = await Transaction.findOne({ _id: entry.originTransactionId }, { projection: { method: 1 } });
      originMethod = tx?.method || null;
    }

    const future = new Date(entry.availableIn).getTime() > Date.now();
    console.log(
      `- wallet ${w.userId} | entry ${entry._id} | amount R$${entry.amount} | origem: ${originMethod ?? "(sem tx — provável saque manual)"} | availableIn: ${entry.availableIn} | futuro: ${future}`
    );

    if (originMethod === "pix" && future) pixLockedWrongly++;
    if (originMethod === "credit_card") cardLocked++;
  }
}

console.log(`\nTotal de reservas: ${totalEntries}`);
console.log(`Sem "method" (pré-fix): ${missingMethod}`);
console.log(`Pix presas incorretamente (futuro, deveriam ser D0): ${pixLockedWrongly}`);
console.log(`Cartão (retenção correta, elegível a antecipação): ${cardLocked}`);

await mongoose.disconnect();
