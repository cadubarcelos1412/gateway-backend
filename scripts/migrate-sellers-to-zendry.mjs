// Migra sellers com acquirer "pagarme" pra "zendry" — reversível (loga o
// estado anterior antes de mudar).
// Rodar: node scripts/migrate-sellers-to-zendry.mjs
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Seller = mongoose.connection.collection("sellers");

const before = await Seller.find({ acquirer: "pagarme" }).toArray();
console.log(`Migrando ${before.length} seller(s) de "pagarme" para "zendry":`);
before.forEach((s) => console.log(`- ${s.name} <${s.email}> (${s._id})`));

const result = await Seller.updateMany({ acquirer: "pagarme" }, { $set: { acquirer: "zendry" } });
console.log(`\nAtualizados: ${result.modifiedCount}`);

await mongoose.disconnect();
