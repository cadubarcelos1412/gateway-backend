// Ajuste manual solicitado pelo usuário: o saldo real na Zendry pro
// tiosnoopimports é R$3979.81 — a diferença em relação ao nosso número vem
// de taxa de saque não cobrada em saques antigos (antes da correção de
// hoje). Ajusta o saldo disponível pra bater com a Zendry, com lançamento
// de ledger (débito passivo_seller / crédito receita_taxa_kissa — é
// receita de taxa que deveria ter sido capturada e não foi), em vez de um
// $set silencioso.
import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);

const { postLedgerEntries } = await import("../dist/services/ledger/ledger.service.js");

const Users = mongoose.connection.collection("users");
const Wallets = mongoose.connection.collection("wallets");
const Sellers = mongoose.connection.collection("sellers");

const user = await Users.findOne({ email: "tiosnoopimports@gmail.com" });
const wallet = await Wallets.findOne({ userId: user._id });
const seller = await Sellers.findOne({ userId: user._id });

const TARGET = 3979.81;
const before = wallet.balance.available;
const diff = Number((before - TARGET).toFixed(2));
const syntheticTxId = new mongoose.Types.ObjectId();

console.log("Saldo ANTES:", before);
console.log("Saldo ALVO (real na Zendry):", TARGET);
console.log("Diferença a ajustar:", diff);

if (diff <= 0) {
  console.log("Diferença <= 0, nada a fazer.");
  await mongoose.disconnect();
  process.exit(0);
}

const session = await mongoose.startSession();
session.startTransaction();
try {
  await Wallets.updateOne(
    { _id: wallet._id },
    {
      $set: { "balance.available": TARGET },
      $push: {
        log: {
          transactionId: syntheticTxId,
          type: "withdraw",
          method: "manual",
          amount: diff,
          security: {
            createdAt: new Date(),
            ipAddress: "system",
            userAgent: "reconciliation-manual",
          },
        },
      },
    },
    { session }
  );

  await postLedgerEntries(
    [
      { account: "passivo_seller", type: "debit", amount: diff },
      { account: "receita_taxa_kissa", type: "credit", amount: diff },
    ],
    {
      idempotencyKey: `reconcile_manual:${syntheticTxId.toString()}`,
      transactionId: syntheticTxId.toString(),
      sellerId: seller._id.toString(),
      source: { system: "cashout", acquirer: "zendry" },
      eventAt: new Date(),
    },
    session
  );

  await session.commitTransaction();
  console.log("\n✅ Ajustado com sucesso.");
} catch (err) {
  await session.abortTransaction();
  console.error("❌ Falhou:", err);
  throw err;
} finally {
  session.endSession();
}

const walletAfter = await Wallets.findOne({ userId: user._id });
console.log("Saldo DEPOIS:", walletAfter.balance.available);

await mongoose.disconnect();
