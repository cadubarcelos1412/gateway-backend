// Read-only: procura evidência de tentativas reais de pagamento por cartão
// no log de auditoria (TransactionAuditService), já que uma tentativa que
// falha na Zendry (3DS, autorização) nunca chega a criar um Transaction —
// só fica registrada aqui.
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection;
const collections = await db.db.listCollections().toArray();
console.log("Coleções disponíveis:", collections.map((c) => c.name).join(", "));

const auditCollectionName = collections.find((c) => /audit/i.test(c.name))?.name;
if (!auditCollectionName) {
  console.log("Nenhuma coleção de auditoria encontrada.");
  process.exit(0);
}

const Audit = db.collection(auditCollectionName);
const cardAttempts = await Audit.find({ method: "credit_card" }).sort({ createdAt: -1 }).limit(30).toArray();
console.log(`\nTentativas de cartão no log de auditoria (${auditCollectionName}): ${cardAttempts.length}`);
for (const a of cardAttempts) {
  console.log(`- ${a._id} | status=${a.status} | flags=${JSON.stringify(a.flags)} | desc="${a.description}" | createdAt=${a.createdAt}`);
}

const allMethods = await Audit.distinct("method");
console.log(`\nValores distintos de "method" no log de auditoria:`, allMethods);

await mongoose.disconnect();
