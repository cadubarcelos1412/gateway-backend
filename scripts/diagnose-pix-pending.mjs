// Diagnóstico read-only de um pagamento Pix que não confirmou.
// Rodar: node scripts/diagnose-pix-pending.mjs pay_6a73c178f9c038e980c2f3b8
import "dotenv/config";
import mongoose from "mongoose";

const publicId = process.argv[2];
if (!publicId) {
  console.error("Uso: node scripts/diagnose-pix-pending.mjs pay_xxxxx");
  process.exit(1);
}

const rawId = publicId.replace(/^pay_/, "");

await mongoose.connect(process.env.MONGO_URI);

const Transaction = mongoose.connection.collection("transactions");
const Seller = mongoose.connection.collection("sellers");
const ZendryWebhookEvent = mongoose.connection.collection("zendrywebhookevents");
const ApiKey = mongoose.connection.collection("apikeys");

const tx = await Transaction.findOne({ _id: new mongoose.Types.ObjectId(rawId) });
if (!tx) {
  console.log("Transação não encontrada com esse ID.");
  process.exit(0);
}

console.log("=== Transação ===");
console.log({
  id: tx._id.toString(),
  userId: tx.userId?.toString(),
  status: tx.status,
  mode: tx.mode,
  method: tx.method,
  amount: tx.amount,
  externalId: tx.externalId,
  idempotencyKey: tx.idempotencyKey,
  createdAt: tx.createdAt,
});

const seller = await Seller.findOne({ userId: tx.userId });
console.log("\n=== Seller ===");
console.log({
  sellerId: seller?._id?.toString(),
  acquirer: seller?.acquirer,
  kycStatus: seller?.kycStatus,
  status: seller?.status,
});

console.log("\n=== ZendryWebhookEvent (por externalId) ===");
const events = await ZendryWebhookEvent.find({ externalId: tx.externalId }).toArray();
if (events.length === 0) {
  console.log("NENHUM evento de webhook da Zendry encontrado com esse externalId.");
} else {
  events.forEach((e) => console.log({ action: e.action, createdAt: e.createdAt, rawPayload: e.rawPayload }));
}

console.log("\n=== Últimos 5 eventos de webhook da Zendry (qualquer transação, pra ver se ALGO está chegando) ===");
const recent = await ZendryWebhookEvent.find({}).sort({ createdAt: -1 }).limit(5).toArray();
if (recent.length === 0) {
  console.log("NENHUM evento de webhook da Zendry já chegou, nunca, nessa base.");
} else {
  recent.forEach((e) => console.log({ externalId: e.externalId, action: e.action, createdAt: e.createdAt }));
}

await mongoose.disconnect();
