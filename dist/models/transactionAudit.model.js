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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionAudit = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const TransactionAuditSchema = new mongoose_1.Schema({
    transactionId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Transaction", index: true },
    sellerId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Seller", required: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ["pix", "credit_card", "boleto"], required: true },
    status: { type: String, enum: ["pending", "approved", "failed", "blocked"], required: true },
    description: { type: String },
    kycStatus: { type: String, required: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    buyerDocument: { type: String, trim: true },
    geoCountry: { type: String, trim: true },
    geoCity: { type: String, trim: true },
    asn: { type: String, trim: true },
    attemptCount: { type: Number, default: 1, min: 1 },
    flags: [
        {
            type: String,
            enum: [
                "NO_KYC",
                "HIGH_AMOUNT",
                "SUSPICIOUS_IP",
                "FAILED_ATTEMPT",
                "UNKNOWN_DEVICE",
                "FOREIGN_IP",
                "BUYER_EQUALS_SELLER",
            ],
        },
    ],
    // 📊 Inteligência antifraude adicional
    riskScore: { type: Number, min: 0, max: 100, default: 0 },
    retentionDays: { type: Number, default: 0 },
    retentionAmount: { type: Number, default: 0 },
    createdAt: { type: Date, default: () => new Date(), immutable: true },
}, { versionKey: false });
/* -------------------------------------------------------------------------- */
/* 📊 Índices estratégicos para investidor e auditoria                         */
/* -------------------------------------------------------------------------- */
// 🔍 Por seller e data — essencial para relatórios e detecção de anomalias
TransactionAuditSchema.index({ sellerId: 1, createdAt: -1 });
// 🚨 Por flag — usado em dashboards antifraude
TransactionAuditSchema.index({ flags: 1 });
// 📍 Por IP — facilita bloqueio de ranges e detecção de padrões
TransactionAuditSchema.index({ ipAddress: 1 });
// 🧑‍💼 Por documento do comprador — útil para detectar compradores reincidentes
TransactionAuditSchema.index({ buyerDocument: 1 });
// 📈 Por score de risco — essencial em machine learning futuro
TransactionAuditSchema.index({ riskScore: -1 });
exports.TransactionAudit = mongoose_1.default.model("TransactionAudit", TransactionAuditSchema);
