// Ação direta solicitada pelo usuário: zera o saldo disponível remanescente
// da conta tiosnoopimports@gmail.com (confusão acumulada de vários bugs
// hoje deixou o número não confiável) e desliga o saque automático dele até
// confirmarmos que o envio real pela Zendry funciona (hoje falha
// silenciosamente todas as vezes, sem exceção, confirmado consultando a
// Zendry diretamente — nenhum dos saques dele chegou lá através do nosso
// sistema).
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Wallets = mongoose.connection.collection("wallets");
const Sellers = mongoose.connection.collection("sellers");

const user = await Users.findOne({ email: "tiosnoopimports@gmail.com" });
const wallet = await Wallets.findOne({ userId: user._id });
const seller = await Sellers.findOne({ userId: user._id });

console.log("Antes:");
console.log(`  available: R$${wallet.balance.available}`);
console.log(`  unAvailable: ${wallet.balance.unAvailable.length} entradas`);
console.log(`  autoWithdrawEnabled: ${seller?.autoWithdrawEnabled}`);

await Wallets.updateOne({ _id: wallet._id }, { $set: { "balance.available": 0 } });
await Sellers.updateOne({ _id: seller._id }, { $set: { autoWithdrawEnabled: false } });

console.log("\n✅ Feito:");
console.log("  balance.available -> 0");
console.log("  autoWithdrawEnabled -> false");

await mongoose.disconnect();
