// src/services/ledger/ledgerExport.service.ts
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import LedgerSnapshotModel from "../../models/ledger/ledgerSnapshot.model";

export class LedgerExportService {
  /**
   * 📤 Exporta snapshots de uma data para JSON/CSV/PDF
   */
  static async exportSnapshots(dateKey: string, format: "json" | "csv" = "json") {
    console.log(`\n📦 Exportando snapshots contábeis (${dateKey}) em formato ${format}...`);

    const snapshots = await LedgerSnapshotModel.find({ dateKey }).lean();
    if (!snapshots.length) {
      console.warn(`⚠️ Nenhum snapshot encontrado para ${dateKey}`);
      return;
    }

    const dir = path.resolve("exports");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    const filePath = path.join(dir, `ledger-snapshots-${dateKey}.${format}`);
    let content = "";

    if (format === "json") {
      content = JSON.stringify(snapshots, null, 2);
    } else {
      const headers = Object.keys(snapshots[0]).join(",");
      const rows = snapshots.map((s) => Object.values(s).join(","));
      content = [headers, ...rows].join("\n");
    }

    fs.writeFileSync(filePath, content, "utf-8");

    // gera hash do arquivo
    const hash = createHash("sha256").update(content).digest("hex");
    console.log(`✅ Export concluído: ${filePath}`);
    console.log(`🔐 Hash SHA256: ${hash}`);

    return { filePath, hash };
  }
}
