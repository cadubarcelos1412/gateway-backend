import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Users = mongoose.connection.collection("users");
const Wallets = mongoose.connection.collection("wallets");
const Transactions = mongoose.connection.collection("transactions");
const CashoutRequests = mongoose.connection.collection("cashoutrequests");
const Sellers = mongoose.connection.collection("sellers");

const email = "tiosnoopimports@gmail.com";
const user = await Users.findOne({ email });
const wallet = await Wallets.findOne({ userId: user._id });
const seller = await Sellers.findOne({ userId: user._id });

console.log("=== Wallet ===");
console.log("available:", wallet.balance.available);
console.log("unAvailable:", JSON.stringify(wallet.balance.unAvailable, null, 2));

console.log("\n=== Seller feeTable pixIn/pixOut ===");
console.log(JSON.stringify(seller.feeTable?.pixIn), JSON.stringify(seller.feeTable?.pixOut));

const approvedPix = await Transactions.find({ userId: user._id, method: "pix", type: "deposit", status: "approved", mode: "live" })
  .sort({ createdAt: 1 })
  .toArray();

console.log(`\n=== Transações Pix aprovadas (live): ${approvedPix.length} ===`);
let sumAmount = 0, sumFee = 0, sumNet = 0;
for (const t of approvedPix) {
  sumAmount += t.amount;
  sumFee += t.fee;
  sumNet += t.netAmount;
  console.log(`${t.createdAt.toISOString()} amount=${t.amount} fee=${t.fee} net=${t.netAmount} retention=${t.retention} creditedAt=${Boolean(t.creditedAt)}`);
}
console.log(`\nTOTAL amount=${sumAmount.toFixed(2)} fee=${sumFee.toFixed(2)} net=${sumNet.toFixed(2)}`);

const cashouts = await CashoutRequests.find({ userId: user._id }).sort({ createdAt: 1 }).toArray();
console.log(`\n=== Cashouts: ${cashouts.length} ===`);
let sumCashoutAmount = 0;
for (const c of cashouts) {
  console.log(`${c.createdAt.toISOString()} status=${c.status} amount=${c.amount} fee=${c.fee} netAmount=${c.netAmount} providerStatus=${c.providerStatus}`);
  if (c.status === "approved" || c.status === "completed") sumCashoutAmount += c.amount;
}

console.log(`\n=== Reconciliação simples ===`);
console.log(`Soma net creditado (vendas): R$${sumNet.toFixed(2)}`);
console.log(`Soma saques aprovados (valor debitado): R$${sumCashoutAmount.toFixed(2)}`);
console.log(`Esperado available = sumNet - sumCashoutAmount - unAvailable atual: R$${(sumNet - sumCashoutAmount - wallet.balance.unAvailable.reduce((s,e)=>s+e.amount,0)).toFixed(2)}`);
console.log(`Available real na wallet: R$${wallet.balance.available.toFixed(2)}`);

await mongoose.disconnect();
