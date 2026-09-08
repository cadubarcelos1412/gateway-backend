// Liga pixPhoneOnlyEnabled pra TODOS os sellers já existentes (decisão do
// master, 2026-09-08 — default do schema já mudou pra true, isso aqui é só
// o backfill de quem já estava cadastrado antes da mudança).
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Sellers = mongoose.connection.collection("sellers");

const before = await Sellers.countDocuments({ pixPhoneOnlyEnabled: { $ne: true } });
const result = await Sellers.updateMany({ pixPhoneOnlyEnabled: { $ne: true } }, { $set: { pixPhoneOnlyEnabled: true } });

console.log(`Sellers sem pixPhoneOnlyEnabled=true antes: ${before}`);
console.log(`Sellers atualizados agora: ${result.modifiedCount}`);

await mongoose.disconnect();
