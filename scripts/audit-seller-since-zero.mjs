import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Wallets = mongoose.connection.collection("wallets");

const user = await Users.findOne({ email: "tiosnoopimports@gmail.com" });
const wallet = await Wallets.findOne({ userId: user._id });

// O saldo foi zerado manualmente via script hoje mais cedo (fora do fluxo
// normal, não fica registrado no log) — soma só o que aconteceu DEPOIS
// desse ponto, usando 0 como base.
const cutoff = new Date("2026-08-10T20:20:00.000Z");

let running = 0;
const entries = wallet.log
  .filter(e => new Date(e.security.createdAt) > cutoff)
  .sort((a,b)=> new Date(a.security.createdAt) - new Date(b.security.createdAt));

for (const e of entries) {
  if (e.type === "topup") running += e.amount;
  else if (e.type === "withdraw") running -= e.amount;
  else if (e.type === "reversal") running -= e.amount;
}

console.log(`Entradas de log depois do corte (${cutoff.toISOString()}): ${entries.length}`);
console.log(`Saldo calculado a partir de 0: R$${running.toFixed(2)}`);
console.log(`Saldo real na wallet (available): R$${wallet.balance.available.toFixed(2)}`);
console.log(`Diferença: R$${(running - wallet.balance.available).toFixed(2)}`);

await mongoose.disconnect();
