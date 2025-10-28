"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const pdf_lib_1 = require("pdf-lib");
const ledgerSnapshot_model_1 = __importDefault(require("../models/ledger/ledgerSnapshot.model"));
/**
 * 📘 Proof of Settlement (T+1)
 * Gera PDF de fechamento contábil diário com assinatura SHA256.
 */
(async () => {
    console.log("🏁 Iniciando Proof of Settlement (T+1)...");
    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
        console.error("❌ MONGO_URI não configurada no .env");
        process.exit(1);
    }
    await mongoose_1.default.connect(mongoUri);
    console.log("✅ Conectado ao banco de dados.");
    // 📅 Data alvo (T+1 = ontem)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
    const dateStr = targetDate.toISOString().split("T")[0];
    console.log(`📅 Data alvo: ${dateStr}`);
    // 🔍 Busca snapshots do ledger
    const snapshots = await ledgerSnapshot_model_1.default.find({ dateKey: dateStr });
    if (!snapshots.length) {
        console.warn("⚠️ Nenhum snapshot encontrado para a data.");
        await mongoose_1.default.disconnect();
        return;
    }
    // 📊 Calcula totais
    const totalDebit = snapshots.reduce((acc, s) => acc + (s.debitTotal || 0), 0);
    const totalCredit = snapshots.reduce((acc, s) => acc + (s.creditTotal || 0), 0);
    const balance = totalCredit - totalDebit;
    // 📁 Cria diretório de exportação
    const exportDir = path_1.default.join(__dirname, "../../exports/proof");
    if (!fs_1.default.existsSync(exportDir))
        fs_1.default.mkdirSync(exportDir, { recursive: true });
    // 🧮 Gera hash SHA256
    const hashContent = `${dateStr}|${totalDebit}|${totalCredit}|${balance}|${snapshots.length}`;
    const hash = crypto_1.default.createHash("sha256").update(hashContent).digest("hex");
    // 🧾 Cria PDF
    const pdfDoc = await pdf_lib_1.PDFDocument.create();
    const page = pdfDoc.addPage([600, 780]);
    const font = await pdfDoc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const title = "KISSA - Proof of Settlement (T+1)";
    const subtitle = `Date: ${dateStr}`;
    const divider = "------------------------------------------";
    const body = `
Ledger Summary (Audit Snapshot)
${divider}
Total Debit : R$ ${totalDebit.toFixed(2)}
Total Credit: R$ ${totalCredit.toFixed(2)}
Balance     : R$ ${balance.toFixed(2)}

Records: ${snapshots.length}
Generated at: ${new Date().toISOString()}
`;
    // 🖋 Escreve no PDF
    page.drawText(title, { x: 50, y: 720, size: 18, font, color: (0, pdf_lib_1.rgb)(0, 0, 0) });
    page.drawText(subtitle, { x: 50, y: 700, size: 12, font, color: (0, pdf_lib_1.rgb)(0, 0, 0) });
    page.drawText(body, { x: 50, y: 650, size: 11, font, color: (0, pdf_lib_1.rgb)(0, 0, 0) });
    page.drawText("Signature Hash (SHA256):", { x: 50, y: 130, size: 10, font, color: (0, pdf_lib_1.rgb)(0, 0, 0) });
    page.drawText(hash, { x: 50, y: 115, size: 9, font, color: (0, pdf_lib_1.rgb)(0, 0, 0) });
    const pdfBytes = await pdfDoc.save();
    const pdfPath = path_1.default.join(exportDir, `${dateStr}_proof-of-settlement.pdf`);
    const hashPath = path_1.default.join(exportDir, `${dateStr}_proof-of-settlement.sha256`);
    fs_1.default.writeFileSync(pdfPath, pdfBytes);
    fs_1.default.writeFileSync(hashPath, hash);
    console.log("📄 Resumo:");
    console.log(`   Débito total : R$ ${totalDebit.toFixed(2)}`);
    console.log(`   Crédito total: R$ ${totalCredit.toFixed(2)}`);
    console.log(`   Saldo (C-D)  : R$ ${balance.toFixed(2)}`);
    console.log(`🔑 SHA256: ${hash}`);
    console.log(`🧾 PDF salvo em: ${pdfPath}`);
    console.log(`📜 Hash salvo em: ${hashPath}`);
    console.log("✅ Assinatura digital incluída.");
    await mongoose_1.default.disconnect();
    console.log("🏁 Concluído!");
})();
