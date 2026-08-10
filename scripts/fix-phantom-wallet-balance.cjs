// Correção retroativa do bug corrigido em 2026-08-10 em transaction.service.ts
// / zendryPaymentStatus.service.ts: até essa data, TODA transação live virava
// crédito em wallet.balance na CRIAÇÃO (status "pending"), não na aprovação —
// e como Pix é D+0 + a liberação automática de saldo, isso virava saldo
// DISPONÍVEL em minutos mesmo sem o comprador ter pago nada.
//
// Este script reverte, usando a função de reversão JÁ EXISTENTE e testada
// (reverseTransactionLedgerAndWallet — mesma lógica usada quando a Zendry
// reporta "rejected"/"cancelled"), o crédito indevido de toda transação live
// que nunca chegou a "approved" e nunca foi revertida. Setar `creditedAt =
// createdAt` antes de chamar é necessário porque, com o código NOVO já
// deployado, a função de reversão só age em transações marcadas como
// creditadas — e essas nunca tiveram esse campo (não existia antes de hoje),
// mas FORAM creditadas de fato pelo código antigo.
//
// Rodar (dry-run primeiro): node scripts/fix-phantom-wallet-balance.cjs --dry-run
// Rodar de verdade:         node scripts/fix-phantom-wallet-balance.cjs
require("dotenv/config");
const mongoose = require("mongoose");
const { reverseTransactionLedgerAndWallet } = require("../dist/services/ledger/reversal.service.js");
const { Transaction } = require("../dist/models/transaction.model.js");
const { Wallet } = require("../dist/models/wallet.model.js");
const { Seller } = require("../dist/models/seller.model.js");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Conectado. Modo: ${DRY_RUN ? "DRY RUN (nada será alterado)" : "EXECUÇÃO REAL"}\n`);

  const affected = await Transaction.find({
    mode: "live",
    status: { $in: ["pending", "failed"] },
    reversedAt: { $exists: false },
  });

  console.log(`Transações candidatas à correção: ${affected.length}\n`);

  let totalCorrected = 0;
  let totalAmount = 0;

  for (const tx of affected) {
    const wallet = await Wallet.findOne({ userId: tx.userId });
    const seller = await Seller.findOne({ userId: tx.userId });
    const label = `${tx._id} | seller=${seller?.email || tx.userId} | status=${tx.status} | netAmount=R$${tx.netAmount} | createdAt=${tx.createdAt}`;

    if (DRY_RUN) {
      console.log(`[DRY RUN] reverteria: ${label}`);
      totalCorrected++;
      totalAmount += tx.netAmount || 0;
      continue;
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Marca que FOI creditada (pelo código antigo, na criação) — necessário
      // pra reverseTransactionLedgerAndWallet não pular (o campo é novo, só
      // existe pra transações criadas depois do fix de hoje).
      tx.creditedAt = tx.createdAt;
      await reverseTransactionLedgerAndWallet(tx, session, "correção retroativa 2026-08-10: crédito otimista na criação revertido, pagamento nunca confirmado");
      await session.commitTransaction();
      console.log(`✅ corrigida: ${label}`);
      totalCorrected++;
      totalAmount += tx.netAmount || 0;
    } catch (err) {
      await session.abortTransaction();
      console.error(`❌ falhou: ${label} — ${err.message}`);
    } finally {
      session.endSession();
    }
  }

  console.log(`\n${DRY_RUN ? "Seriam corrigidas" : "Corrigidas"}: ${totalCorrected} transações, R$${totalAmount.toFixed(2)} no total.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
