import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const Sellers = mongoose.connection.collection("sellers");
const sellers = await Sellers.find({}).toArray();
for (const s of sellers) {
  console.log(`${s.email} | autoWithdrawEnabled=${s.autoWithdrawEnabled}`);
}
await mongoose.disconnect();
