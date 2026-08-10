// Read-only: estado completo de saque + carteira de um seller específico.
// Rodar: node scripts/check-seller-cashout-status.mjs <email>
import "dotenv/config";
import mongoose from "mongoose";

const email = process.argv[2];
if (!email) {
  console.error("Uso: node scripts/check-seller-cashout-status.mjs <email>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Cashouts = mongoose.connection.collection("cashoutrequests");
const Wallets = mongoose.connection.collection("wallets");

const user = await Users.findOne({ email });
if (!user) {
  console.log("Usuário não encontrado.");
  process.exit(0);
}
console.log(`Seller: ${user.name} (${user.email}) | id: ${user._id} | withdrawalPin configurado: ${!!user.withdrawalPin?.hash}\n`);

const wallet = await Wallets.findOne({ userId: user._id });
console.log(`Saldo disponível: R$${wallet?.balance?.available ?? 0}`);
console.log(`Reservas (unAvailable): ${wallet?.balance?.unAvailable?.length ?? 0}\n`);

const cashouts = await Cashouts.find({ userId: user._id }).sort({ createdAt: -1 }).toArray();
console.log(`Solicitações de saque (todas): ${cashouts.length}`);
for (const c of cashouts) {
  console.log(`- id: ${c._id} | status: ${c.status} | valor: R$${c.amount} | rail: ${c.rail} | criado: ${c.createdAt} | rejectionReason: ${c.rejectionReason || "-"}`);
}

await mongoose.disconnect();
