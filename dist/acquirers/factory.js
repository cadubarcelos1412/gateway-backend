"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAcquirer = void 0;
const pagarme_acquirer_1 = require("./pagarme.acquirer");
const getAcquirer = (key) => {
    const map = {
        pagarme: pagarme_acquirer_1.PagarmeAcquirer,
    };
    const Acquirer = map[key];
    if (!Acquirer)
        throw new Error(`Adquirente desconhecida: ${key}`);
    return new Acquirer();
};
exports.getAcquirer = getAcquirer;
