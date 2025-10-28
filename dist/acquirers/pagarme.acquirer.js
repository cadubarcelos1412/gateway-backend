"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PagarmeAcquirer = void 0;
/**
 * 🏦 PagarmeAcquirer
 * Adapter responsável por integrar transações com a adquirente Pagar.me.
 * Implementa a interface IAcquirer garantindo compatibilidade com o core.
 */
class PagarmeAcquirer {
    async createTransaction(payload) {
        /**
         * 🚧 Aqui será feita a integração real com a API da Pagar.me.
         * No momento, estamos retornando um mock seguro para manter o fluxo contábil ativo.
         */
        return {
            externalId: "mock_pagarme_tx_001",
            acquirer: "pagarme",
            rawResponse: { mock: true },
            status: "pending", // valores possíveis: 'pending' | 'approved' | 'failed'
        };
    }
}
exports.PagarmeAcquirer = PagarmeAcquirer;
