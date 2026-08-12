import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const CashoutRequests = mongoose.connection.collection("cashoutrequests");
const ids = ["6a7c4a4cc02be3b5bb70153c", "6a7c4ba8c02be3b5bb705b2a"];
for (const id of ids) {
  const c = await CashoutRequests.findOne({ _id: new mongoose.Types.ObjectId(id) });
  console.log(`${id} | status=${c.status} | rejectionReason=${c.rejectionReason}`);
}
await mongoose.disconnect();
