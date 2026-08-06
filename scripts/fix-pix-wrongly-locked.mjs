// Corrige o efeito do bug: settlementDaysOverride (prazo do cartão) estava
// vazando pro Pix, prendendo saldo Pix por até 30 dias quando deveria ser D0.
// Pra cada reserva (unAvailable) sem "method" (criada antes do campo
// existir), resolve o método pela transação de origem:
//   - pix        -> D0 já venceu, libera na hora (move pra available)
//   - credit_card -> retenção estava correta, só faz backfill de method:"card"
//   - boleto      -> idem, method:"bill"
//   - sem tx (saque manual) -> method:"manual"
// Rodar: node scripts/fix-pix-wrongly-locked.mjs
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Wallet = mongoose.connection.collection("wallets");
const Transaction = mongoose.connection.collection("transactions");

const wallets = await Wallet.find({ "balance.unAvailable.0": { $exists: true } }).toArray();
console.log(`Wallets com reservas: ${wallets.length}`);

let releasedTotal = 0;
let releasedCount = 0;
let backfilledCount = 0;

for (const w of wallets) {
  const keep = [];
  let available = w.balance.available;
  let changed = false;

  for (const entry of w.balance.unAvailable) {
    if (entry.method) {
      keep.push(entry);
      continue;
    }

    let originMethod = null;
    if (entry.originTransactionId) {
      const tx = await Transaction.findOne({ _id: entry.originTransactionId }, { projection: { method: 1 } });
      originMethod = tx?.method || null;
    }

    if (originMethod === "pix") {
      available += entry.amount;
      releasedTotal += entry.amount;
      releasedCount++;
      changed = true;
      console.log(`✅ Liberado imediatamente: wallet ${w.userId} — R$${entry.amount} (Pix, era pra ser D0)`);
      continue; // não entra no keep — sai da lista de reservas
    }

    const method = originMethod === "credit_card" ? "card" : originMethod === "boleto" ? "bill" : "manual";
    keep.push({ ...entry, method });
    backfilledCount++;
    changed = true;
  }

  if (changed) {
    await Wallet.updateOne(
      { _id: w._id },
      { $set: { "balance.unAvailable": keep, "balance.available": available } }
    );
  }
}

console.log(`\nTotal liberado agora: R$${releasedTotal.toFixed(2)} em ${releasedCount} reservas Pix.`);
console.log(`Reservas com method preenchido (cartão/boleto/manual, sem alterar availableIn): ${backfilledCount}`);

await mongoose.disconnect();
