import mongoose from "mongoose";
import LedgerEntryModel from "../../models/ledger/ledgerEntry.model";
import LedgerBatchModel from "../../models/ledger/ledgerBatch.model";
import { LedgerSnapshotService } from "./ledgerSnapshot.service";

/**
 * 📦 LedgerBatchService
 * Responsável por fechar o dia contábil (batch diário).
 *
 * - Agrega os lançamentos do ledger
 * - Gera um registro de fechamento (LedgerBatch)
 * - Dispara o snapshot diário consolidado
 */
export class LedgerBatchService {
  /**
   * 🔹 Fecha o lote diário de lançamentos (imutável)
   */
  static async closeDailyBatch(date: Date = new Date()): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const dateKey = date.toISOString().split("T")[0];
      console.log(`📅 Fechando lote contábil do dia ${dateKey}...`);

      // Evita duplicar o batch se já foi fechado
      const exists = await LedgerBatchModel.findOne({ dateKey });
      if (exists && exists.closed) {
        console.log(`⚠️ Lote ${dateKey} já fechado anteriormente.`);
        await session.abortTransaction();
        return;
      }

      // Agrega total do dia
      const startOfDay = new Date(`${dateKey}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateKey}T23:59:59.999Z`);

      const totals = await LedgerEntryModel.aggregate([
        {
          $match: { createdAt: { $gte: startOfDay, $lte: endOfDay } },
        },
        {
          $group: {
            _id: null,
            totalEntries: { $sum: 1 },
            totalDebit: {
              $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] },
            },
            totalCredit: {
              $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] },
            },
          },
        },
      ]);

      if (totals.length === 0) {
        console.log(`⚠️ Nenhum lançamento encontrado para ${dateKey}.`);
        await session.abortTransaction();
        return;
      }

      const t = totals[0];
      const batchId = new mongoose.Types.ObjectId();

      await LedgerBatchModel.create(
        [
          {
            dateKey,
            batchId,
            totalEntries: t.totalEntries,
            totalDebit: t.totalDebit,
            totalCredit: t.totalCredit,
            closed: true,
            closedAt: new Date(),
          },
        ],
        { session }
      );

      // 🔁 Gera snapshot diário automaticamente
      await LedgerSnapshotService.createDailySnapshots(date);

      await session.commitTransaction();
      console.log(`✅ Lote contábil ${dateKey} fechado com sucesso.`);
    } catch (err) {
      await session.abortTransaction();
      console.error("❌ Erro ao fechar lote contábil:", err);
      throw err;
    } finally {
      session.endSession();
    }
  }

  /**
   * 📊 Consulta status do lote de um dia
   */
  static async getBatchStatus(date: Date) {
    const dateKey = date.toISOString().split("T")[0];
    return await LedgerBatchModel.findOne({ dateKey }).lean();
  }
}
