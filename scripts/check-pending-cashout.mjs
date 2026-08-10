// Read-only: lista solicitações de saque pendentes com dados do seller.
// Rodar: node scripts/check-pending-cashout.mjs
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Cashouts = mongoose.connection.collection("cashoutrequests");

const pending = await Cashouts.find({ status: "pending" }).sort({ createdAt: -1 }).toArray();
console.log(`Solicitações de saque pendentes: ${pending.length}\n`);

for (const c of pending) {
  const user = await Users.findOne({ _id: c.userId }, { projection: { name: 1, email: 1 } });
  console.log(`- id: ${c._id} | seller: ${user?.name} (${user?.email}) | valor: R$${c.amount} | rail: ${c.rail} | criado: ${c.createdAt}`);
}

await mongoose.disconnect();
