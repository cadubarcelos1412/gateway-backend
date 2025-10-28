"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/dailyProofCron.ts
const node_cron_1 = __importDefault(require("node-cron"));
const child_process_1 = require("child_process");
function log(msg) {
    const time = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    console.log(`[${time}] ${msg}`);
}
log("⏰ Agendador contábil diário iniciado...");
// Executa diariamente às 23:59 (horário de Brasília)
node_cron_1.default.schedule("59 23 * * *", () => {
    log("🏁 Iniciando rotina automática: Proof of Settlement + Conciliation Engine...");
    // 1️⃣ Executa Proof of Settlement
    (0, child_process_1.exec)("npx ts-node src/scripts/proof-of-settlement.ts", (error, stdout, stderr) => {
        if (error) {
            log(`❌ Erro no Proof of Settlement: ${error.message}`);
            return;
        }
        if (stderr)
            log(`⚠️ Aviso Proof: ${stderr}`);
        log(stdout);
        // 2️⃣ Depois que o proof terminar, executa a conciliação T+1
        log("🧮 Executando Conciliation Engine (T+1)...");
        (0, child_process_1.exec)("npx ts-node src/scripts/conciliation-engine.ts", (err2, out2, errMsg2) => {
            if (err2) {
                log(`❌ Erro na conciliação: ${err2.message}`);
                return;
            }
            if (errMsg2)
                log(`⚠️ Aviso conciliação: ${errMsg2}`);
            log(out2);
            log("✅ Rotina contábil diária concluída com sucesso!");
        });
    });
});
