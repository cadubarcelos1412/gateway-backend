import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const CashoutRequests = mongoose.connection.collection("cashoutrequests");
const pending = await CashoutRequests.find({ status: "pending" }).sort({ createdAt: -1 }).toArray();
console.log(`Pendentes: ${pending.length}`);
for (const c of pending) {
  console.log(JSON.stringify(c, null, 2));
}
await mongoose.disconnect();
