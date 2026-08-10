import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const Transactions = mongoose.connection.collection("transactions");
const pending = await Transactions.find({ method: "credit_card", status: "pending", mode: "live" }).toArray();
console.log(`Transações de cartão pendentes (live): ${pending.length}`);
for (const t of pending) {
  console.log(`- ${t._id} | userId=${t.userId} | amount=${t.amount} | externalId=${t.externalId} | createdAt=${t.createdAt} | cardLastDigits=${t.paymentDetails?.cardLastDigits}`);
}
await mongoose.disconnect();
