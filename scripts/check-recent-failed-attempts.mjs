// Read-only: mostra as tentativas de pagamento falhadas mais recentes
// (TransactionAudit com flag FAILED_ATTEMPT) — a "description" guarda o
// erro real vindo da adquirente, que a API esconde do comprador atrás da
// mensagem genérica "Erro ao criar transação na adquirente."
// Rodar: node scripts/check-recent-failed-attempts.mjs
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const TransactionAudit = mongoose.connection.collection("transactionaudits");
const Seller = mongoose.connection.collection("sellers");

const recent = await TransactionAudit.find({ flags: "FAILED_ATTEMPT" })
  .sort({ createdAt: -1 })
  .limit(10)
  .toArray();

for (const entry of recent) {
  const seller = await Seller.findOne({ _id: entry.sellerId }, { projection: { name: 1, email: 1 } });
  console.log(`\n[${entry.createdAt}] seller: ${seller?.name || entry.sellerId}`);
  console.log(`  amount: R$${entry.amount} | method: ${entry.method}`);
  console.log(`  description (erro real): ${entry.description}`);
}

await mongoose.disconnect();
