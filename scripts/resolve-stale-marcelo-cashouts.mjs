// Marca os 2 saques travados desde 2026-08-10 (R$3 e R$800) como
// resolvidos, SEM tocar no saldo — o saldo já foi zerado manualmente em
// 2026-08-11 (zero-and-disable-marcelo.mjs), então isso aqui é só limpar o
// registro que ficava aparecendo como "aguardando confirmação" pra sempre
// (nunca tiveram externalReference — nunca chegaram a ser enviados de
// verdade, são de antes de todo o rastreamento de fee/providerStatus
// existir).
import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const CashoutRequests = mongoose.connection.collection("cashoutrequests");

const ids = ["6a7a5c7bacbcd08bad8516f7", "6a7a3c6db621dc94c3c86162"];
const reason =
  "Registro anterior ao rastreamento de fee/providerStatus, nunca chegou a ser enviado (sem externalReference). " +
  "Saldo já resolvido manualmente em 2026-08-11 (ver zero-and-disable-marcelo.mjs) — esse ajuste só limpa o status, não mexe no saldo.";

for (const id of ids) {
  const result = await CashoutRequests.updateOne(
    { _id: new mongoose.Types.ObjectId(id), status: "approved" },
    { $set: { status: "rejected", rejectionReason: reason } }
  );
  console.log(`${id}: matched=${result.matchedCount} modified=${result.modifiedCount}`);
}

await mongoose.disconnect();
