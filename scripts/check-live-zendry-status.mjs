import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Audits = mongoose.connection.collection("transactionaudits");
const Transactions = mongoose.connection.collection("transactions");

const since5min = new Date(Date.now() - 5 * 60 * 1000);
const recentFails = await Audits.find({ createdAt: { $gte: since5min }, status: "failed" })
  .sort({ createdAt: -1 })
  .toArray();
const recentOk = await Transactions.find({ method: "pix", createdAt: { $gte: since5min } })
  .sort({ createdAt: -1 })
  .toArray();

console.log(`Agora: ${new Date().toISOString()}`);
console.log(`Falhas nos últimos 5 min: ${recentFails.length}`);
recentFails.forEach(a => console.log(`  ${a.createdAt.toISOString()} - ${a.description}`));
console.log(`Transações Pix criadas com sucesso nos últimos 5 min: ${recentOk.length}`);
recentOk.forEach(t => console.log(`  ${t.createdAt.toISOString ? t.createdAt.toISOString() : t.createdAt} - R$${t.amount} - has QR: ${Boolean(t.paymentDetails?.pixCode)}`));

await mongoose.disconnect();
