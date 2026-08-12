import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const CashoutRequests = mongoose.connection.collection("cashoutrequests");

const c = await CashoutRequests.find({ amount: 88 }).sort({ createdAt: -1 }).limit(3).toArray();
console.log(JSON.stringify(c, null, 2));

await mongoose.disconnect();
