import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const CashoutRequests = mongoose.connection.collection("cashoutrequests");

// Todo saque "approved" cujo providerStatus não é claramente um sucesso
const all = await CashoutRequests.find({ status: "approved", rail: "pix" }).sort({ createdAt: -1 }).limit(20).toArray();
console.log("Últimos 20 saques Pix aprovados e seus providerStatus reais da Zendry:");
for (const c of all) {
  console.log(`${c.createdAt.toISOString()} | amount=${c.amount} | providerStatus="${c.providerStatus}"`);
}

await mongoose.disconnect();
