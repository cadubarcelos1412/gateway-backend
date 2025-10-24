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
exports.Transaction = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* -------------------------------------------------------------------------- */
/* 🏦 Esquema Mongoose – Transações com antifraude e auditoria               */
/* -------------------------------------------------------------------------- */
const TransactionSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Product", required: true },
    amount: { type: Number, required: true },
    fee: { type: Number, required: true },
    netAmount: { type: Number, required: true },
    retention: { type: Number, required: true },
    type: {
        type: String,
        enum: ["deposit", "withdraw"],
        required: true,
    },
    method: {
        type: String,
        enum: ["pix", "credit_card", "boleto"],
        required: true,
        index: true,
    },
    status: {
        type: String,
        enum: ["pending", "approved", "failed"],
        default: "pending",
        index: true,
    },
    description: { type: String, trim: true, maxlength: 255 },
    externalId: { type: String, index: true },
    postback: { type: String },
    idempotencyKey: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
    },
    riskFlags: {
        type: [String],
        enum: ["HIGH_AMOUNT", "FOREIGN_IP", "NO_KYC"],
        default: [],
        index: true,
    },
    trackingParameters: {
        utm_source: { type: String, trim: true },
        utm_medium: { type: String, trim: true },
        utm_campaign: { type: String, trim: true },
        utm_content: { type: String, trim: true },
        utm_term: { type: String, trim: true },
    },
    purchaseData: {
        customer: {
            name: { type: String, trim: true },
            email: { type: String, trim: true },
            document: { type: String, trim: true },
            phone: { type: String, trim: true },
            ip: { type: String, trim: true },
        },
        products: [
            {
                name: { type: String, trim: true },
                price: { type: Number },
            },
        ],
    },
    createdAt: { type: Date, default: Date.now, index: true },
}, {
    versionKey: false,
    timestamps: false,
});
/* -------------------------------------------------------------------------- */
/* 📊 Índices estratégicos – performance, antifraude e auditoria             */
/* -------------------------------------------------------------------------- */
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ method: 1 });
TransactionSchema.index({ "purchaseData.customer.document": 1 });
TransactionSchema.index({ "purchaseData.customer.email": 1 });
TransactionSchema.index({ riskFlags: 1 });
TransactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
exports.Transaction = mongoose_1.default.model("Transaction", TransactionSchema);
