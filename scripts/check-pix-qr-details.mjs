import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Transactions = mongoose.connection.collection("transactions");

const tx = await Transactions.findOne({ externalId: "4abd8100-3c82-4897-96b2-803b2e1d66e1" });
console.log(JSON.stringify(tx, null, 2));

await mongoose.disconnect();
