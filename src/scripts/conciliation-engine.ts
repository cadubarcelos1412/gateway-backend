import mongoose from "mongoose";
import LedgerSnapshotModel from "../models/ledger/ledgerSnapshot.model";

/**
 * 🧮 Conciliation Engine (T+1)
 * Reconciliar LedgerSnapshot + extrato bancário + adquirente.
 * Objetivo: divergência < 0.05%
 */
(async () => {
  console.log("🏁 Iniciando Conciliation Engine (T+1)...");

  const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!mongoUri) {
    console.error("❌ MONGO_URI não configurada no .env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("✅ Conectado ao banco de dados.");

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 1);
  const dateStr = targetDate.toISOString().split("T")[0];
  console.log(`📅 Rodando conciliação para ${dateStr}...`);

  // 1️⃣ Busca snapshots contábeis do dia anterior
  const snapshots = await LedgerSnapshotModel.find({ dateKey: dateStr });
  if (!snapshots.length) {
    console.warn("⚠️ Nenhum snapshot encontrado para a data.");
    await mongoose.disconnect();
    return;
  }

  // 2️⃣ Simula extrato bancário e adquirente (mock temporário)
  const bankFeed = [
    { ref: "PIX_OUT_001", amount: 1000, type: "debit" as const },
    { ref: "PIX_IN_002", amount: 1000, type: "credit" as const },
  ];

  const acquirerFeed = [
    { transactionId: "TX001", gross: 2000, fee: 40, net: 1960 },
  ];

  // 3️⃣ Calcula totais ledger
  const ledgerDebit = snapshots.reduce((acc, s) => acc + (s.debitTotal || 0), 0);
  const ledgerCredit = snapshots.reduce((acc, s) => acc + (s.creditTotal || 0), 0);
  const ledgerBalance = ledgerCredit - ledgerDebit;

  // 4️⃣ Calcula totais externos
  const bankBalance = bankFeed.reduce(
    (acc, e) => acc + (e.type === "credit" ? e.amount : -e.amount),
    0
  );
  const acquirerBalance = acquirerFeed.reduce((acc, a) => acc + a.net, 0);

  // 5️⃣ Calcula divergência percentual
  const totalExpected = ledgerBalance;
  const totalFound = bankBalance + acquirerBalance;
  const divergence = Math.abs(totalExpected - totalFound) / (totalExpected || 1);

  // 6️⃣ Atualiza o snapshot com status de lock
  const locked = divergence >= 0.0005;
  await LedgerSnapshotModel.updateMany(
    { dateKey: dateStr },
    { $set: { locked, divergence } }
  );

  // 7️⃣ Exibe resultados
  console.log("📊 Totais:");
  console.log(`   Ledger:     R$ ${ledgerBalance.toFixed(2)}`);
  console.log(`   Bancário:   R$ ${bankBalance.toFixed(2)}`);
  console.log(`   Adquirente: R$ ${acquirerBalance.toFixed(2)}`);
  console.log(`   Divergência: ${(divergence * 100).toFixed(3)}%`);

  if (locked) {
    console.warn("🔒 Divergência detectada — Cashouts bloqueados.");
  } else {
    console.log("✅ Ledger íntegro — Cashouts liberados.");
  }

  await mongoose.disconnect();
  console.log("🔌 Conciliação finalizada.");
})();
