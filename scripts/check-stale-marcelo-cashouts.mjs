import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const CashoutRequests = mongoose.connection.collection("cashoutrequests");
const ids = ["6a7a5c7bacbcd08bad8516f7", "6a7a3c6db621dc94c3c86162"];
for (const id of ids) {
  const c = await CashoutRequests.findOne({ _id: new mongoose.Types.ObjectId(id) });
  console.log(JSON.stringify(c, null, 2));
}
await mongoose.disconnect();
