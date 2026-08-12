import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Wallets = mongoose.connection.collection("wallets");
const Users = mongoose.connection.collection("users");

const wallets = await Wallets.find({ "balance.available": { $gte: 3900, $lte: 4050 } }).toArray();
for (const w of wallets) {
  const user = await Users.findOne({ _id: w.userId });
  console.log(`${user?.email || w.userId} | available=${w.balance.available} | unAvailable entries=${w.balance.unAvailable.length}`);
}

await mongoose.disconnect();
