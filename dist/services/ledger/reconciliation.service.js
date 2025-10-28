"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconciliationService = void 0;
// src/services/ledger/reconciliation.service.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ledgerSnapshot_model_1 = __importDefault(require("../../models/ledger/ledgerSnapshot.model"));
/**
 * 🏦 ReconciliationService
 * Faz a conciliação entre ledger interno e extratos externos (banco/adquirente)
 */
class ReconciliationService {
    /**
     * 🔹 Lê um extrato CSV/JSON externo e compara com LedgerSnapshots
     * @param filePath Caminho do extrato (ex: exports/getpay-2025-10-21.json)
     * @param dateKey Data no formato YYYY-MM-DD
     */
    static async reconcileExternalFile(filePath, dateKey) {
        console.log(`\n🏦 Iniciando conciliação bancária (${dateKey})...`);
        if (!fs_1.default.existsSync(filePath)) {
            throw new Error(`Arquivo ${filePath} não encontrado`);
        }
        const ext = path_1.default.extname(filePath).toLowerCase();
        const externalData = ext === ".json"
            ? JSON.parse(fs_1.default.readFileSync(filePath, "utf-8"))
            : await this.parseCsv(fs_1.default.readFileSync(filePath, "utf-8"));
        const snapshots = await ledgerSnapshot_model_1.default.find({ dateKey }).lean();
        let matched = 0;
        const missingInLedger = [];
        const missingInExternal = [];
        for (const extRow of externalData) {
            const found = snapshots.find((s) => s.account === extRow.account &&
                Math.abs(s.balance - extRow.balance) < 0.01);
            if (found)
                matched++;
            else
                missingInLedger.push(extRow);
        }
        for (const snap of snapshots) {
            const found = externalData.find((e) => e.account === snap.account &&
                Math.abs(e.balance - snap.balance) < 0.01);
            if (!found)
                missingInExternal.push(snap);
        }
        console.log(`\n📅 Data auditada: ${dateKey}`);
        console.log(`✅ Registros coincidentes: ${matched}`);
        console.log(`❌ Faltando no ledger: ${missingInLedger.length}`);
        console.log(`⚠️ Faltando no extrato: ${missingInExternal.length}`);
        return { matched, missingInLedger, missingInExternal };
    }
    /**
     * 🧾 Parser simples de CSV externo (extratos)
     */
    static async parseCsv(data) {
        const lines = data.trim().split("\n");
        const headers = lines[0].split(",");
        return lines.slice(1).map((line) => {
            const cols = line.split(",");
            const obj = {};
            headers.forEach((h, i) => (obj[h.trim()] = isNaN(+cols[i]) ? cols[i] : +cols[i]));
            return obj;
        });
    }
}
exports.ReconciliationService = ReconciliationService;
