// Read-only: distribuição de `method` nas transações via API pública, e
// checa se o método bate com o que foi de fato processado (pixCode presente
// pra pix, cardLastDigits presente pra cartão) — usado pra confirmar se o
// campo `method` está mesmo errado no banco, ou se é só a exibição no front.
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Transactions = mongoose.connection.collection("transactions");

const recent = await Transactions.find({ "metadata.source": "api" })
  .sort({ createdAt: -1 })
  .limit(100)
  .toArray();

console.log(`Últimas ${recent.length} transações via API:\n`);

const methodCounts = {};
let inconsistent = 0;

for (const t of recent) {
  methodCounts[t.method] = (methodCounts[t.method] || 0) + 1;

  const hasPixArtifact = !!t.paymentDetails?.pixCode;
  const hasCardArtifact = !!t.paymentDetails?.cardLastDigits;

  if (t.method === "credit_card" && hasPixArtifact) {
    inconsistent++;
    console.log(`⚠️ ${t._id} | method=credit_card MAS tem pixCode | createdAt=${t.createdAt}`);
  }
  if (t.method === "pix" && hasCardArtifact) {
    inconsistent++;
    console.log(`⚠️ ${t._id} | method=pix MAS tem cardLastDigits | createdAt=${t.createdAt}`);
  }
}

console.log(`\nDistribuição de method (últimas ${recent.length} via API):`, methodCounts);
console.log(`Inconsistências method vs artefato real de pagamento: ${inconsistent}`);

await mongoose.disconnect();
