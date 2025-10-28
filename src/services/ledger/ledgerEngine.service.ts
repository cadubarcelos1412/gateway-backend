import mongoose, { Types } from "mongoose";
import LedgerSnapshotModel, {
  LedgerSnapshotDocument,
} from "../../models/ledger/ledgerSnapshot.model";
import { Transaction, ITransaction } from "../../models/transaction.model";

/**
 * 🧱 LedgerEngine (Fechamento Contábil T+0)
 * - Consolida créditos e débitos diários por seller
 * - Gera snapshot contábil para conciliação T+1
 */
export class LedgerEngine {
  static async run(): Promise<void> {
    console.log("\n📘 [LedgerEngine] Iniciando fechamento contábil T+0...");

    const today = new Date();
    const dateKey = today.toISOString().split("T")[0];

    // 🔍 Buscar transações do dia
    const txs: ITransaction[] = await Transaction.find({
      createdAt: {
        $gte: new Date(`${dateKey}T00:00:00.000Z`),
        $lte: new Date(`${dateKey}T23:59:59.999Z`),
      },
    });

    if (txs.length === 0) {
      console.warn(`⚠️ Nenhuma transação encontrada para ${dateKey}.`);
      return;
    }

    // 🧮 Agrupar transações por seller
    const grouped: Record<string, ITransaction[]> = txs.reduce(
      (acc: Record<string, ITransaction[]>, tx: ITransaction) => {
        const key = tx.sellerId ? tx.sellerId.toString() : "global";
        if (!acc[key]) acc[key] = [];
        acc[key].push(tx);
        return acc;
      },
      {}
    );

    // 🧾 Gerar snapshots contábeis por seller
    for (const [sellerId, sellerTxs] of Object.entries(grouped)) {
      const debitTotal = sellerTxs
        .filter((t: ITransaction) => t.status === "failed")
        .reduce((sum: number, t: ITransaction) => sum + t.amount, 0);

      const creditTotal = sellerTxs
        .filter((t: ITransaction) => t.status === "approved")
        .reduce((sum: number, t: ITransaction) => sum + (t.netAmount || 0), 0);

      const balance = creditTotal - debitTotal;

      const snapshot: LedgerSnapshotDocument = new LedgerSnapshotModel({
        dateKey,
        sellerId:
          sellerId === "global" ? undefined : new Types.ObjectId(sellerId),
        account: "operational",
        balance,
        debitTotal,
        creditTotal,
        locked: false,
      });

      await snapshot.save();

      console.log(
        `✅ Snapshot criado → ${
          sellerId === "global" ? "GLOBAL" : sellerId
        } | Saldo: R$ ${balance.toFixed(2)}`
      );
    }

    console.log("\n📘 [LedgerEngine] Fechamento contábil concluído com sucesso.");
  }
}

/* -------------------------------------------------------------------------- */
/* 🌐 Execução direta (CLI) – Conecta no Mongo e roda o fechamento            */
/* -------------------------------------------------------------------------- */
if (require.main === module) {
  const MONGO_URI =
    process.env.MONGO_URI ||
    "mongodb+srv://cadu_db_user:R74srMzIT1f4L3W8@gateway-core.u26ywbv.mongodb.net/gateway-db?retryWrites=true&w=majority&appName=gateway-core";

  (async () => {
    try {
      console.log("🌐 Conectando ao MongoDB Atlas...");
      await mongoose.connect(MONGO_URI);
      console.log("✅ Conectado ao MongoDB Atlas.");

      await LedgerEngine.run();
    } catch (err) {
      console.error("❌ Erro ao executar LedgerEngine:", err);
    } finally {
      await mongoose.disconnect();
      console.log("🔌 Conexão encerrada.");
      process.exit(0);
    }
  })();
}
