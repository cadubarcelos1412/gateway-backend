// Read-only: conta sellers por adquirente configurada.
// Rodar: node scripts/check-sellers-acquirer.mjs
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Seller = mongoose.connection.collection("sellers");

const counts = await Seller.aggregate([{ $group: { _id: "$acquirer", count: { $sum: 1 } } }]).toArray();
console.log("Sellers por adquirente:", counts);

const pagarmeSellers = await Seller.find({ acquirer: "pagarme" }).project({ name: 1, email: 1, createdAt: 1 }).toArray();
console.log("\nSellers em 'pagarme':");
pagarmeSellers.forEach((s) => console.log(`- ${s.name} <${s.email}> (${s._id})`));

await mongoose.disconnect();
