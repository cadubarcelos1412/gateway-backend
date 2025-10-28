"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAcquirer = createAcquirer;
const acquirerSelector_1 = require("./acquirerSelector");
const pagarme_acquirer_1 = require("./pagarme.acquirer");
/**
 * 🏭 Factory responsável por retornar a instância correta da adquirente.
 * - Atualmente, a Kissa opera apenas com a Pagar.me.
 * - Caso novas adquirentes sejam integradas no futuro, basta adicioná-las aqui.
 */
async function createAcquirer(sellerId) {
    const acquirerKey = await (0, acquirerSelector_1.selectAcquirer)(sellerId);
    switch (acquirerKey) {
        case "pagarme":
        default:
            if (acquirerKey !== "pagarme") {
                console.warn(`⚠️ Acquirer "${acquirerKey}" não reconhecida. Usando Pagar.me como fallback.`);
            }
            return new pagarme_acquirer_1.PagarmeAcquirer();
    }
}
