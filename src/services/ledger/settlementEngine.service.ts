// src/services/ledger/settlementEngine.service.ts
import mongoose from "mongoose";
import axios from "axios";
import dotenv from "dotenv";
import LedgerSnapshotModel from "../../models/ledger/ledgerSnapshot.model";
import CashoutRequestModel from "../../models/cashoutRequest.model"; // default export do model
import { TransactionAuditService } from "../transactionAudit.service";
import { LEDGER_ACCOUNTS } from "../../config/ledger-accounts";

dotenv.config();

/**
 * 🏦 SettlementEngine (Liquidação Bancária D+2)
 * - Consulta liquidações confirmadas na adquirente (ex.: Pagar.me)
 * - Atualiza snapshots contábeis e marca cashouts como liquidados
 * - Registra auditoria e divergências
 */
export class SettlementEngine {
  static async run() {
    console.log("\n🏦 [SettlementEngine] Iniciando liquidação D+2...");

    try {
      console.log("🌐 Conectando ao MongoDB Atlas...");
      await mongoose.connect(process.env.MONGO_URI as string);
      console.log("✅ Conectado ao MongoDB Atlas.\n");

      // 🔎 Cashouts criados até D+2 e ainda pendentes
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 2);

      const pendingCashouts = await CashoutRequestModel.find({
        createdAt: { $lte: cutoff },
        status: "pending",
      });

      if (pendingCashouts.length === 0) {
        console.log("⚠️ Nenhum cashout pendente de liquidação (D+2).");
        return;
      }

      console.log(`🔍 ${pendingCashouts.length} cashouts aguardando confirmação.\n`);

      // ⚙️ Integração com Pagar.me (exemplo de listagem de transfers)
      const pagarmeApi = "https://api.pagar.me/core/v5/transfers";
      const headers = { Authorization: `Basic ${process.env.PAGARME_API_KEY}` };

      // Opcional: pode-se paginar/filtrar por data
      const response = await axios.get(pagarmeApi, { headers });
      const transfers: any[] = response.data?.data || [];

      for (const cashout of pendingCashouts) {
        try {
          // sellerRef cobre projetos que usam userId no lugar de sellerId
          const sellerRef =
            (cashout as any).sellerId ??
            (cashout as any).userId ??
            null;

          // 🧩 Tenta achar uma transferência compatível (valor e, se existir, conta destino)
          const match = transfers.find((t: any) => {
            const sameAmount =
              Math.abs(t.amount / 100 - cashout.amount) < 0.01; // tolerância centesimal
            const sameBank =
              !(cashout as any).bankAccountId ||
              t.bank_account?.id === (cashout as any).bankAccountId;
            return sameAmount && sameBank && ["paid", "completed"].includes(t.status);
          });

          if (!match) {
            console.log(`⚠️ Nenhuma liquidação encontrada para cashout ${cashout._id}`);
            continue;
          }

          // 🧾 Atualiza status do cashout
          (cashout as any).status = "settled";
          (cashout as any).settledAt = new Date();
          await cashout.save();

          // 🧮 Atualiza LedgerSnapshot (reduz passivo do seller)
          const dateKey = new Date().toISOString().split("T")[0];
          await LedgerSnapshotModel.updateOne(
            {
              dateKey,
              account: LEDGER_ACCOUNTS.PASSIVO_SELLER,
              sellerId: sellerRef,
            },
            { $inc: { balance: -cashout.amount } },
            { upsert: true }
          );

          // 🧠 Log de auditoria
          await TransactionAuditService.log({
            transactionId: new mongoose.Types.ObjectId(),
            sellerId: sellerRef ?? new mongoose.Types.ObjectId(), // fallback seguro
            userId: sellerRef ?? undefined,
            amount: cashout.amount,
            method: "pix",
            status: "approved",
            kycStatus: "verified",
            flags: [],
            description: `Liquidação confirmada (Pagar.me transfer ${match.id})`,
          });

          console.log(
            `✅ Liquidação confirmada: R$${cashout.amount.toFixed(2)} para ${sellerRef ?? "seller-desconhecido"}`
          );
        } catch (innerErr) {
          console.warn("⚠️ Falha ao conciliar cashout:", innerErr);
        }
      }
    } catch (err) {
      console.error("❌ Erro no SettlementEngine:", err);
    } finally {
      await mongoose.connection.close();
      console.log("🔌 Conexão encerrada.\n");
    }
  }
}

// 🚀 Execução direta via CLI
if (require.main === module) {
  SettlementEngine.run();
}
