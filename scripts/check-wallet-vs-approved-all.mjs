// Read-only: mesmo check de check-wallet-vs-approved.mjs, mas pra TODOS os
// sellers — mede o tamanho real do problema (crédito otimista de transação
// "pending" entrando em wallet.balance).
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Wallets = mongoose.connection.collection("wallets");
const Transactions = mongoose.connection.collection("transactions");

const wallets = await Wallets.find({}).toArray();
console.log(`Total de wallets: ${wallets.length}\n`);

let totalDiff = 0;

for (const wallet of wallets) {
  const user = await Users.findOne({ _id: wallet.userId });
  const txs = await Transactions.find({ userId: wallet.userId, type: "deposit", mode: "live" }).toArray();

  const approvedNet = txs.filter((t) => t.status === "approved").reduce((s, t) => s + (t.netAmount || 0), 0);
  const pendingNet = txs.filter((t) => t.status === "pending").reduce((s, t) => s + (t.netAmount || 0), 0);
  const unAvailableSum = (wallet.balance?.unAvailable || []).reduce((s, e) => s + e.amount, 0);
  const available = wallet.balance?.available || 0;

  const totalWalletMoney = available + unAvailableSum;
  const diff = totalWalletMoney - approvedNet;

  if (Math.abs(diff) > 1) {
    console.log(
      `⚠️ ${user?.email || wallet.userId} | wallet(available+unAvailable)=R$${totalWalletMoney.toFixed(2)} | aprovadas(net)=R$${approvedNet.toFixed(2)} | pendentes(net)=R$${pendingNet.toFixed(2)} | diferença=R$${diff.toFixed(2)}`
    );
    totalDiff += diff;
  }
}

console.log(`\nDiferença total (soma de todos os sellers com divergência): R$${totalDiff.toFixed(2)}`);

await mongoose.disconnect();
