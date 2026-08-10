// Read-only: compara o saldo disponível da carteira com a soma real de
// transações APROVADAS — se available >> soma de aprovadas, confirma que
// dinheiro de transações pending está sendo contado como se já tivesse sido
// recebido.
import "dotenv/config";
import mongoose from "mongoose";

const email = process.argv[2] || "tiosnoopimports@gmail.com";

await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Wallets = mongoose.connection.collection("wallets");
const Transactions = mongoose.connection.collection("transactions");

const user = await Users.findOne({ email });
if (!user) {
  console.log("Usuário não encontrado.");
  process.exit(0);
}

const wallet = await Wallets.findOne({ userId: user._id });
console.log(`Seller: ${user.name} (${user.email})`);
console.log(`Saldo disponível (wallet.balance.available): R$${wallet?.balance?.available ?? 0}`);
console.log(`Reservas (unAvailable): ${wallet?.balance?.unAvailable?.length ?? 0} entradas, soma R$${(wallet?.balance?.unAvailable || []).reduce((s, e) => s + e.amount, 0)}\n`);

const txs = await Transactions.find({ userId: user._id, type: "deposit" }).toArray();

const byStatus = {};
for (const t of txs) {
  const key = `${t.status}`;
  if (!byStatus[key]) byStatus[key] = { count: 0, sumAmount: 0, sumNet: 0 };
  byStatus[key].count++;
  byStatus[key].sumAmount += t.amount;
  byStatus[key].sumNet += t.netAmount || 0;
}

console.log("Transações por status:");
for (const [status, v] of Object.entries(byStatus)) {
  console.log(`  ${status}: ${v.count} transações | soma bruta R$${v.sumAmount.toFixed(2)} | soma líquida (netAmount) R$${v.sumNet.toFixed(2)}`);
}

const approvedNet = (byStatus["approved"]?.sumNet) || 0;
console.log(`\nSe o saldo disponível refletisse só aprovadas: deveria ser ~R$${approvedNet.toFixed(2)}`);
console.log(`Saldo disponível real: R$${wallet?.balance?.available ?? 0}`);
console.log(`Diferença: R$${((wallet?.balance?.available ?? 0) - approvedNet).toFixed(2)}`);

await mongoose.disconnect();
