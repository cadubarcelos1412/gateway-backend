import mongoose from "mongoose";
import dotenv from "dotenv";
import LedgerSnapshot from "../models/ledger/ledgerSnapshot.model";

dotenv.config();

(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
  console.log("✅ Conectado ao banco.");

  const dateKey = "2025-10-20"; // simula o dia anterior
  await LedgerSnapshot.deleteMany({ dateKey });

  await LedgerSnapshot.create([
    {
      dateKey,
      account: "conta_corrente_bancaria",
      balance: 3000,
      debitTotal: 1000,
      creditTotal: 4000,
      createdAt: new Date(),
    },
    {
      dateKey,
      account: "passivo_seller",
      balance: -3000,
      debitTotal: 4000,
      creditTotal: 1000,
      createdAt: new Date(),
    },
  ]);

  console.log("🧾 LedgerSnapshots criados com sucesso!");
  await mongoose.disconnect();
})();
