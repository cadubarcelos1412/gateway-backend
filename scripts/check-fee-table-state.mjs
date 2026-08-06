// Read-only: mostra o estado atual da tabela de taxas padrão (SystemFeeConfig)
// e quantos sellers têm feeTable.cardFees.standard diferente do default.
// Rodar: node scripts/check-fee-table-state.mjs
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);

const SystemFeeConfig = mongoose.connection.collection("systemfeeconfigs");
const Seller = mongoose.connection.collection("sellers");

const config = await SystemFeeConfig.findOne({ key: "default" });
console.log("SystemFeeConfig (default) existe?", Boolean(config));
if (config) {
  console.log("cardFees.standard atual:", JSON.stringify(config.feeTable?.cardFees?.standard, null, 2));
}

const sellers = await Seller.find({}).project({ name: 1, email: 1, "feeTable.cardFees.standard": 1 }).toArray();
console.log(`\nTotal de sellers: ${sellers.length}`);

const currentStandard = config?.feeTable?.cardFees?.standard || {};
for (const s of sellers) {
  const sellerStandard = s.feeTable?.cardFees?.standard;
  const hasOwn = Boolean(sellerStandard);
  const matchesDefault = hasOwn && JSON.stringify(sellerStandard) === JSON.stringify(currentStandard);
  console.log(`- ${s.name || "(sem nome)"} <${s.email}> — feeTable próprio: ${hasOwn} | igual ao default atual: ${matchesDefault}`);
}

await mongoose.disconnect();
