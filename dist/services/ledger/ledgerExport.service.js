"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerExportService = void 0;
// src/services/ledger/ledgerExport.service.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const ledgerSnapshot_model_1 = __importDefault(require("../../models/ledger/ledgerSnapshot.model"));
class LedgerExportService {
    /**
     * 📤 Exporta snapshots de uma data para JSON/CSV/PDF
     */
    static async exportSnapshots(dateKey, format = "json") {
        console.log(`\n📦 Exportando snapshots contábeis (${dateKey}) em formato ${format}...`);
        const snapshots = await ledgerSnapshot_model_1.default.find({ dateKey }).lean();
        if (!snapshots.length) {
            console.warn(`⚠️ Nenhum snapshot encontrado para ${dateKey}`);
            return;
        }
        const dir = path_1.default.resolve("exports");
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir);
        const filePath = path_1.default.join(dir, `ledger-snapshots-${dateKey}.${format}`);
        let content = "";
        if (format === "json") {
            content = JSON.stringify(snapshots, null, 2);
        }
        else {
            const headers = Object.keys(snapshots[0]).join(",");
            const rows = snapshots.map((s) => Object.values(s).join(","));
            content = [headers, ...rows].join("\n");
        }
        fs_1.default.writeFileSync(filePath, content, "utf-8");
        // gera hash do arquivo
        const hash = (0, crypto_1.createHash)("sha256").update(content).digest("hex");
        console.log(`✅ Export concluído: ${filePath}`);
        console.log(`🔐 Hash SHA256: ${hash}`);
        return { filePath, hash };
    }
}
exports.LedgerExportService = LedgerExportService;
