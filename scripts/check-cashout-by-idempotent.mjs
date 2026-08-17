import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const CashoutRequests = mongoose.connection.collection("cashoutrequests");
const id = "6a838ec72456e9de5c8cb7a7";
const c = await CashoutRequests.findOne({ _id: new mongoose.Types.ObjectId(id) });
console.log(JSON.stringify(c, null, 2));
await mongoose.disconnect();
