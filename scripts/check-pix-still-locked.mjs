// Read-only: entre TODAS as reservas (não só as sem "method"), quantas são
// Pix e ainda aparecem com availableIn no futuro — isso não deveria
// acontecer depois do fix em retentionEngine.ts, mas escritas antigas já
// gravaram a data errada no banco antes do deploy.
// Rodar: node scripts/check-pix-still-locked.mjs
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Wallet = mongoose.connection.collection("wallets");

const wallets = await Wallet.find({ "balance.unAvailable.0": { $exists: true } }).toArray();

let totalEntries = 0;
let pixEntries = 0;
let pixFuture = 0;
let pixFutureAmount = 0;
let otherFuture = 0;

const now = Date.now();

for (const w of wallets) {
  for (const entry of w.balance.unAvailable) {
    totalEntries++;
    const future = new Date(entry.availableIn).getTime() > now;
    if (entry.method === "pix") {
      pixEntries++;
      if (future) {
        pixFuture++;
        pixFutureAmount += entry.amount;
        console.log(`- wallet ${w.userId} | entry ${entry._id} | R$${entry.amount} | availableIn: ${entry.availableIn}`);
      }
    } else if (future) {
      otherFuture++;
    }
  }
}

console.log(`\nTotal de reservas (todas): ${totalEntries}`);
console.log(`Reservas de Pix: ${pixEntries}`);
console.log(`Reservas de Pix ainda no futuro (bug): ${pixFuture} — total R$${pixFutureAmount.toFixed(2)}`);
console.log(`Reservas de outros métodos no futuro (normal, cartão/boleto): ${otherFuture}`);

await mongoose.disconnect();
