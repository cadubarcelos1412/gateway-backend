// Correção pontual: aplica "approved" via o mesmo caminho de código real
// (applyZendryPaymentStatus) nas transações de cartão que ficaram presas em
// "pending" por causa do bug corrigido em 2026-08-10 (ver commit).
require("dotenv/config");
const mongoose = require("mongoose");
const { applyZendryPaymentStatus } = require("../dist/services/zendryPaymentStatus.service.js");
const { Transaction } = require("../dist/models/transaction.model.js");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const pending = await Transaction.find({ method: "credit_card", status: "pending", mode: "live" });
  console.log(`Transações de cartão pendentes: ${pending.length}\n`);

  for (const tx of pending) {
    console.log(`Aplicando approved em ${tx._id} (externalId=${tx.externalId})...`);
    const result = await applyZendryPaymentStatus(tx.externalId, "approved");
    console.log(`  -> applied=${result.applied} newlyApproved=${result.newlyApproved}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
