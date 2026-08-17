import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Wallets = mongoose.connection.collection("wallets");
const user = await Users.findOne({ email: "seller@pyxgate.com" });
console.log("user:", JSON.stringify(user, null, 2));
if (user) {
  const wallet = await Wallets.findOne({ userId: user._id });
  console.log("wallet:", JSON.stringify(wallet?.balance, null, 2));
}
await mongoose.disconnect();
