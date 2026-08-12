import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Audits = mongoose.connection.collection("transactionaudits");

const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
const recent = await Audits.find({ createdAt: { $gte: since }, status: { $in: ["failed", "blocked"] } })
  .sort({ createdAt: -1 })
  .limit(30)
  .toArray();

console.log(`Auditorias de falha/bloqueio nas últimas 2h: ${recent.length}`);
for (const a of recent) {
  console.log(
    `${a.createdAt?.toISOString?.() || a.createdAt} | status=${a.status} | method=${a.method} | amount=${a.amount} | flags=${JSON.stringify(a.flags)} | desc=${a.description || "-"}`
  );
}

await mongoose.disconnect();
