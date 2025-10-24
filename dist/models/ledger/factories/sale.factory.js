"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSaleEntries = buildSaleEntries;
const helpers_1 = require("../helpers");
/**
 * Monta as 3 entradas padrão de uma venda (double-entry).
 */
function buildSaleEntries(amount, fee) {
    const net = Math.max(0, amount - fee);
    const entries = [
        { account: "contas_a_receber_adquirente", type: "debit", amount },
        { account: "passivo_seller", type: "credit", amount: net },
        { account: "receita_taxa_kissa", type: "credit", amount: fee },
    ];
    return (0, helpers_1.validateAndNormalizeEntries)(entries);
}
