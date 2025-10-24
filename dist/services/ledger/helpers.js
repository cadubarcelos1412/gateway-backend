"use strict";
/**
 * 🔢 Funções auxiliares contábeis do Ledger
 * - Arredondamento e formatação numérica
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.round2 = void 0;
const round2 = (num) => {
    if (typeof num !== "number" || isNaN(num))
        return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
};
exports.round2 = round2;
