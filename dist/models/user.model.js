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
exports.User = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const userSchema = new mongoose_1.Schema({
    name: { type: String },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ["seller", "admin", "master"],
        default: "seller",
    },
    status: {
        type: String,
        enum: ["pending", "active", "suspended"],
        default: "pending",
    },
    /** ✅ CPF/CNPJ obrigatório e único */
    document: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    token: {
        pushcut: { notificationUrl: String },
        webhook: {
            paidUrl: String,
            generatedUrl: String,
        },
        utmify: { apiKey: String },
        secret: String,
    },
    split: {
        cashIn: {
            pix: {
                fixed: { type: Number, default: 0.0 },
                percentage: { type: Number, default: 0.0 },
            },
            creditCard: {
                fixed: { type: Number, default: 0.0 },
                percentage: { type: Number, default: 0.0 },
            },
            boleto: {
                fixed: { type: Number, default: 0.0 },
                percentage: { type: Number, default: 0.0 },
            },
        },
    },
}, { timestamps: true });
// 📊 Índices úteis
userSchema.index({ email: 1 });
userSchema.index({ document: 1 }, { unique: true });
userSchema.index({ status: 1 });
userSchema.index({ role: 1 });
exports.User = mongoose_1.default.model("User", userSchema);
