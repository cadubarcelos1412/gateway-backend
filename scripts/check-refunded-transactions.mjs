// Read-only: checa se existe alguma transação já marcada como "refunded"
// antes de remover a feature de estorno (pra saber se dá pra tirar a
// action inteira ou se precisa manter suporte de leitura pro histórico).
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Transactions = mongoose.connection.collection("transactions");
const count = await Transactions.countDocuments({ status: "refunded" });
console.log("Transações com status 'refunded':", count);
if (count > 0) {
  const docs = await Transactions.find({ status: "refunded" }).limit(5).toArray();
  console.log(docs.map((d) => ({ id: d._id.toString(), amount: d.amount, refund: d.refund })));
}
await mongoose.disconnect();
