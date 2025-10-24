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
exports.Wallet = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* -------------------------------------------------------------------------- */
/* 🏦 Esquema da carteira – com rastreabilidade e segurança                  */
/* -------------------------------------------------------------------------- */
const WalletSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    balance: {
        available: { type: Number, default: 0, min: 0 },
        unAvailable: [
            {
                amount: { type: Number, default: 0, min: 0 },
                availableIn: { type: Date, required: true },
                originTransactionId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Transaction" }, // 🔎 origem da retenção
                notes: { type: String, trim: true },
            },
        ],
    },
    log: [
        {
            transactionId: {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: "Transaction",
                required: true,
            },
            type: {
                type: String,
                enum: ["topup", "withdraw"],
                required: true,
            },
            method: {
                type: String,
                enum: ["card", "pix", "bill", "manual"],
                required: true,
            },
            amount: { type: Number, required: true },
            security: {
                createdAt: { type: Date, default: Date.now },
                ipAddress: { type: String, required: true },
                userAgent: { type: String, required: true },
                approvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
                riskFlags: [{ type: String }], // 🛡️ salva flags associadas à operação
            },
        },
    ],
}, { timestamps: true, versionKey: false });
/* -------------------------------------------------------------------------- */
/* 📊 Índices estratégicos para performance e auditoria                      */
/* -------------------------------------------------------------------------- */
WalletSchema.index({ userId: 1 });
WalletSchema.index({ "balance.unAvailable.availableIn": 1 });
WalletSchema.index({ "log.security.createdAt": -1 });
WalletSchema.index({ "log.security.riskFlags": 1 });
exports.Wallet = mongoose_1.default.model("Wallet", WalletSchema);
