// Read-only: soma quanto foi enviado de Pix out SEM taxa nenhuma cobrada
// (todo cashout aprovado antes da correção de 2026-08-11, quando fee/netAmount
// não existiam ainda) — pra dimensionar o prejuízo já causado.
// Rodar: node scripts/check-cashout-fee-shortfall.mjs
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);

const CashoutRequests = mongoose.connection.collection("cashoutrequests");
const Sellers = mongoose.connection.collection("sellers");
const Users = mongoose.connection.collection("users");

const approvedPix = await CashoutRequests.find({
  rail: "pix",
  status: { $in: ["approved", "completed"] },
}).toArray();

let totalSent = 0;
let totalMissingFee = 0;
let countMissingFee = 0;

for (const c of approvedPix) {
  totalSent += c.amount;
  if (typeof c.fee !== "number") {
    countMissingFee++;
    // Estima a taxa que DEVERIA ter sido cobrada, usando a taxa atual do
    // seller (pixOut) — aproximação, já que não sabemos qual era a taxa
    // configurada exatamente no momento (mas pixOut raramente muda).
    const seller = await Sellers.findOne({ userId: c.userId });
    const pct = seller?.feeTable?.pixOut?.percentage ?? 1.99;
    const fixed = seller?.feeTable?.pixOut?.fixed ?? 0;
    const estimatedFee = Number((fixed + (c.amount * pct) / 100).toFixed(2));
    totalMissingFee += estimatedFee;
  }
}

console.log(`Saques Pix aprovados/completos: ${approvedPix.length}`);
console.log(`Total enviado: R$${totalSent.toFixed(2)}`);
console.log(`Saques SEM fee registrado (todos, antes da correção): ${countMissingFee}`);
console.log(`Taxa estimada que deveria ter sido cobrada e NÃO foi: R$${totalMissingFee.toFixed(2)}`);

console.log("\n--- Detalhe por seller ---");
const bySeller = new Map();
for (const c of approvedPix) {
  if (typeof c.fee === "number") continue;
  const key = c.userId.toString();
  bySeller.set(key, (bySeller.get(key) || 0) + c.amount);
}
for (const [userId, total] of bySeller.entries()) {
  const user = await Users.findOne({ _id: new mongoose.Types.ObjectId(userId) });
  console.log(`${user?.email || userId}: R$${total.toFixed(2)} sacado sem taxa`);
}

await mongoose.disconnect();
