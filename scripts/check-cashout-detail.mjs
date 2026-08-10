import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const Cashouts = mongoose.connection.collection("cashoutrequests");
const c = await Cashouts.findOne({ _id: new mongoose.Types.ObjectId(process.argv[2]) });
console.log(JSON.stringify(c, null, 2));
await mongoose.disconnect();
