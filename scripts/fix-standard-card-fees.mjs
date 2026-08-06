// Unifica a taxa de cartão: os 5 buckets internos (amex/elo/mastercard/visa/
// standard) passam a ter exatamente a mesma tabela, em vez de uma taxa
// diferente por bandeira — decisão explícita: uma única taxa de cartão,
// simples, sem diferenciação por bandeira. Atualiza o SystemFeeConfig global
// e os 3 sellers atuais (todos contas de teste).
// Rodar: node scripts/fix-standard-card-fees.mjs
import "dotenv/config";
import mongoose from "mongoose";

const CARD_FEES = {
  "1": 8.85, "2": 10.15, "3": 10.84, "4": 11.54, "5": 12.24, "6": 12.95, "7": 13.86,
  "8": 14.59, "9": 15.31, "10": 16.05, "11": 16.79, "12": 17.54, "13": 18.29, "14": 19.05,
};

const cardFeesPayload = {
  "feeTable.cardFees.amex": CARD_FEES,
  "feeTable.cardFees.elo": CARD_FEES,
  "feeTable.cardFees.mastercard": CARD_FEES,
  "feeTable.cardFees.visa": CARD_FEES,
  "feeTable.cardFees.standard": CARD_FEES,
};

await mongoose.connect(process.env.MONGO_URI);
const SystemFeeConfig = mongoose.connection.collection("systemfeeconfigs");
const Seller = mongoose.connection.collection("sellers");

const configResult = await SystemFeeConfig.updateOne({ key: "default" }, { $set: cardFeesPayload });
console.log("SystemFeeConfig atualizado:", configResult.modifiedCount === 1);

const sellersResult = await Seller.updateMany({}, { $set: cardFeesPayload });
console.log(`Sellers atualizados: ${sellersResult.modifiedCount}`);

await mongoose.disconnect();
