// Read-only: olha as tentativas mais recentes de criar Pix (aprovadas,
// pendentes e falhadas) pra diagnosticar um incidente ao vivo.
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Transactions = mongoose.connection.collection("transactions");
const Products = mongoose.connection.collection("products");

const since = new Date(Date.now() - 60 * 60 * 1000); // última 1h
const recent = await Transactions.find({ method: "pix", createdAt: { $gte: since } })
  .sort({ createdAt: -1 })
  .limit(20)
  .toArray();

console.log(`Transações Pix na última 1h: ${recent.length}`);
for (const t of recent) {
  console.log(
    `${t.createdAt.toISOString()} | status=${t.status} | amount=${t.amount} | mode=${t.mode} | desc=${t.description || "-"} | externalId=${t.externalId || "-"}`
  );
}

await mongoose.disconnect();
