// Read-only: verifica se algum Pix foi criado com sucesso (qualquer seller)
// na mesma janela de tempo das falhas 500 da Zendry — ajuda a saber se é
// falha específica de um seller/payload ou instabilidade geral da Zendry.
// Rodar: node scripts/check-pix-success-window.mjs
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Transaction = mongoose.connection.collection("transactions");
const Seller = mongoose.connection.collection("sellers");

const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
const pixTxs = await Transaction.find({ method: "pix", createdAt: { $gte: since } })
  .sort({ createdAt: -1 })
  .project({ userId: 1, amount: 1, status: 1, createdAt: 1, externalId: 1, purchaseData: 1 })
  .toArray();

console.log(`Pix nas últimas 24h: ${pixTxs.length}\n`);
for (const tx of pixTxs) {
  console.log(
    `[${tx.createdAt}] userId=${tx.userId} amount=R$${tx.amount} status=${tx.status} externalId=${tx.externalId || "(vazio — falhou antes da Zendry responder)"}`
  );
}

await mongoose.disconnect();
