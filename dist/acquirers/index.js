"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PagarmeAcquirer = exports.ACQUIRER_REGISTRY = exports.ACQUIRER_KEYS = void 0;
exports.resolveAcquirer = resolveAcquirer;
const pagarme_acquirer_1 = require("./pagarme.acquirer");
/** Chaves registradas para expansão futura (ex: Adyen, Stone, Cielo...) */
exports.ACQUIRER_KEYS = ["pagarme"];
/* -------------------------------------------------------------------------- */
/* 🏭 Registro de Adapters (Factory Map)                                      */
/* -------------------------------------------------------------------------- */
/**
 * Cada adquirente precisa implementar a interface IAcquirer,
 * garantindo consistência entre todas as integrações.
 */
exports.ACQUIRER_REGISTRY = {
    pagarme: pagarme_acquirer_1.PagarmeAcquirer,
};
/* -------------------------------------------------------------------------- */
/* 🧰 resolveAcquirer – instancia dinamicamente o adapter solicitado          */
/* -------------------------------------------------------------------------- */
/**
 * Retorna dinamicamente a adquirente configurada.
 * @param key Chave da adquirente ("pagarme")
 * @example
 * const acquirer = resolveAcquirer("pagarme");
 * await acquirer.createTransaction(dto);
 */
function resolveAcquirer(key) {
    const Adapter = exports.ACQUIRER_REGISTRY[key];
    if (!Adapter)
        throw new Error(`❌ Adquirente não suportada: ${key}`);
    return new Adapter();
}
/* -------------------------------------------------------------------------- */
/* 📦 Re-exports convenientes                                                 */
/* -------------------------------------------------------------------------- */
__exportStar(require("./types"), exports);
__exportStar(require("./IAcquirer"), exports);
var pagarme_acquirer_2 = require("./pagarme.acquirer");
Object.defineProperty(exports, "PagarmeAcquirer", { enumerable: true, get: function () { return pagarme_acquirer_2.PagarmeAcquirer; } });
