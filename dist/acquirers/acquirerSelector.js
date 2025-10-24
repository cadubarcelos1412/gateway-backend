"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectAcquirer = selectAcquirer;
/**
 * Retorna a adquirente a ser usada com base em regras simples.
 * (Por enquanto, fixa em "pagarme" até termos múltiplas ativas)
 */
function selectAcquirer(_sellerId) {
    return "pagarme";
}
