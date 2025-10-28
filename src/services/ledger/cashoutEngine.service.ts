import mongoose from "mongoose";
import LedgerSnapshotModel from "../../models/ledger/ledgerSnapshot.model";
import { Wallet } from "../../models/wallet.model";
import { postLedgerEntries } from "./ledger.service";
import { TransactionAuditService } from "../transactionAudit.service";
import { LEDGER_ACCOUNTS } from "../../config/ledger-accounts";
import { round } from "../../utils/fees";

/**
 * 💰 CashoutEngine
 * Liberação automática D+1 com base nos snapshots contábeis.
 * - Só executa se locked = false (sem divergência)
 * - Debita o passivo e credita a conta bancária (caixa)
 * - Atualiza o saldo disponível do seller
 * - Registra log contábil e auditoria
 */
export class CashoutEngine {
  static async run(): Promise<void> {
    console.log("\n💸 [CashoutEngine] Iniciando liberação D+1...");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateKey = yesterday.toISOString().split("T")[0];

    // 🔍 Buscar snapshots desbloqueados
    const snapshots = await LedgerSnapshotModel.find({ dateKey, locked: false });

    if (snapshots.length === 0) {
      console.warn(`⚠️ Nenhum snapshot elegível encontrado para ${dateKey}.`);
      return;
    }

    for (const snap of snapshots) {
      if (!snap.sellerId || snap.balance <= 0) continue;

      const wallet = await Wallet.findOne({ userId: snap.sellerId });
      if (!wallet) {
        console.warn(`⚠️ Carteira não encontrada para seller ${snap.sellerId}`);
        continue;
      }

      const value = round(snap.balance);

      // 🧾 Lançamentos contábeis (débito no passivo e crédito no caixa)
      await postLedgerEntries(
        [
          { account: LEDGER_ACCOUNTS.PASSIVO_SELLER, type: "debit", amount: value },
          { account: LEDGER_ACCOUNTS.CONTA_CORRENTE, type: "credit", amount: value },
        ],
        {
          idempotencyKey: `cashout:${snap.sellerId}:${dateKey}`,
          transactionId: new mongoose.Types.ObjectId().toString(),
          sellerId: snap.sellerId.toString(),
          source: { system: "cashout_engine", acquirer: "internal" },
          eventAt: new Date(),
        }
      );

      // 💼 Atualiza carteira
      wallet.balance.available = Math.max(0, wallet.balance.available - value);

      // 🧾 Adiciona log de operação (tipo "withdraw")
      wallet.log.push({
        transactionId: new mongoose.Types.ObjectId(),
        type: "withdraw",
        method: "pix",
        amount: value,
        security: {
          createdAt: new Date(),
          ipAddress: "127.0.0.1",
          userAgent: "cashout-engine/1.0",
        },
      });

      await wallet.save();

      // 🧠 Registra auditoria
      await TransactionAuditService.log({
        transactionId: new mongoose.Types.ObjectId(),
        sellerId: snap.sellerId,
        userId: snap.sellerId,
        amount: value,
        method: "pix",
        status: "approved",
        kycStatus: "verified",
        flags: [],
        description: `Cashout automático D+1 (${dateKey})`,
      });

      console.log(`✅ Cashout executado → Seller ${snap.sellerId} | R$ ${value.toFixed(2)}`);
    }

    console.log("💰 [CashoutEngine] Liberação D+1 concluída com sucesso.");
  }
}

/* -------------------------------------------------------------------------- */
/* 🌐 Execução direta via CLI                                                  */
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

      await CashoutEngine.run();
    } catch (err) {
      console.error("❌ Erro ao executar CashoutEngine:", err);
    } finally {
      await mongoose.disconnect();
      console.log("🔌 Conexão encerrada.");
      process.exit(0);
    }
  })();
}
