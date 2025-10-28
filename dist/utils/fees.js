"use strict";
// src/utils/fees.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.round = exports.calculatePixTax = void 0;
/**
 * Calcula a taxa para pagamentos com PIX
 * @param amount Valor total da transação
 * @param fixed Taxa fixa em reais (ex: R$0,50)
 * @param percentage Percentual da taxa (ex: 2.99%)
 * @returns Valor da taxa (arredondado para 2 casas)
 */
const calculatePixTax = (amount, fixed, percentage) => {
    const tax = fixed + (amount * percentage) / 100;
    return Number(tax.toFixed(2)); // arredonda para 2 casas decimais
};
exports.calculatePixTax = calculatePixTax;
/**
 * Arredonda qualquer número para 2 casas decimais
 */
const round = (value) => {
    return Number(value.toFixed(2));
};
exports.round = round;
