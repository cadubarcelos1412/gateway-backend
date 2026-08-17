// Instrução direta do usuário (2026-08-17): o saque PE202608170001429525
// (R$750 líquido) foi enviado pra uma chave Pix digitada errada pelo
// próprio seller (Marcelo). Quando a Zendry cancelar/devolver esse valor,
// NÃO deve voltar pro Marcelo — vai pra seller@pyxgate.com em vez disso.
// Isso só marca a intenção (refundToUserId); a devolução em si só acontece
// quando (e se) a Zendry realmente confirmar o cancelamento, via
// pixPayoutReconciliation.service.ts (roda automático a cada 10 min).
import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);

const CashoutRequests = mongoose.connection.collection("cashoutrequests");
const Users = mongoose.connection.collection("users");

const cashoutId = new mongoose.Types.ObjectId("6a838ec72456e9de5c8cb7a7");
const houseUser = await Users.findOne({ email: "seller@pyxgate.com" });
if (!houseUser) throw new Error("seller@pyxgate.com não encontrado.");

const before = await CashoutRequests.findOne({ _id: cashoutId });
console.log("Cashout antes:", JSON.stringify({ status: before.status, providerStatus: before.providerStatus, refundToUserId: before.refundToUserId }, null, 2));

const result = await CashoutRequests.updateOne(
  { _id: cashoutId, status: "approved" },
  { $set: { refundToUserId: houseUser._id } }
);
console.log(`\nAtualizado: matched=${result.matchedCount} modified=${result.modifiedCount}`);

const after = await CashoutRequests.findOne({ _id: cashoutId });
console.log("Cashout depois:", JSON.stringify({ status: after.status, providerStatus: after.providerStatus, refundToUserId: after.refundToUserId }, null, 2));

await mongoose.disconnect();
