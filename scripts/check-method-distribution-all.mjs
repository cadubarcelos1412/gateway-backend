// Read-only: distribuição de `method` em TODAS as transações (não só via
// API), agrupado por origem (metadata.source), pra saber se existe
// transação de cartão em algum lugar do sistema e se a mistura bate com o
// que aparece nas telas.
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Transactions = mongoose.connection.collection("transactions");

const pipeline = [
  {
    $group: {
      _id: { method: "$method", source: "$metadata.source" },
      count: { $sum: 1 },
    },
  },
  { $sort: { count: -1 } },
];

const result = await Transactions.aggregate(pipeline).toArray();
console.log("Distribuição method x origem (todas as transações):");
for (const r of result) {
  console.log(`  method=${r._id.method ?? "(nenhum)"} | source=${r._id.source ?? "(nenhuma)"} | count=${r.count}`);
}

const totalCard = await Transactions.countDocuments({ method: "credit_card" });
const totalPix = await Transactions.countDocuments({ method: "pix" });
const totalBoleto = await Transactions.countDocuments({ method: "boleto" });
console.log(`\nTotal geral — credit_card: ${totalCard} | pix: ${totalPix} | boleto: ${totalBoleto}`);

await mongoose.disconnect();
