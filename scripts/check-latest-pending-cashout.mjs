import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const CashoutRequests = mongoose.connection.collection("cashoutrequests");
const recent = await CashoutRequests.find({}).sort({ createdAt: -1 }).limit(5).toArray();
for (const c of recent) {
  console.log(JSON.stringify(c, null, 2));
  console.log("---");
}
await mongoose.disconnect();
