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
exports.Checkout = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const CheckoutSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        ref: "User",
        immutable: true, // ✅ evita alteração após criação
    },
    productId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        ref: "Product",
        immutable: true,
    },
    settings: {
        logoUrl: { type: String, default: "/" },
        bannerUrl: { type: String, default: "/" },
        redirectUrl: { type: String, default: "/" },
        validateDocument: { type: Boolean, default: false },
        needAddress: { type: Boolean, default: false },
        bodyCode: { type: String, required: true, trim: true },
        headCode: { type: String, required: true, trim: true },
    },
    paymentMethods: {
        creditCard: {
            enabled: { type: Boolean, default: true },
            discount: { type: Number, default: 0, min: 0 },
        },
        pix: {
            enabled: { type: Boolean, default: true },
            discount: { type: Number, default: 0, min: 0 },
        },
        boleto: {
            enabled: { type: Boolean, default: true },
            expirationDays: { type: Number, default: 3, min: 1 },
            discount: { type: Number, default: 0, min: 0 },
        },
    },
    whatsappButton: {
        status: { type: Boolean, default: false },
        number: { type: String, default: "" },
    },
    countdownTimer: {
        status: { type: Boolean, default: false },
        title: { type: String, default: "" },
        time: { type: Number, default: 0, min: 0 },
    },
    orderBump: {
        status: { type: Boolean, default: false },
        productId: { type: String, default: "" },
    },
    testimonials: {
        status: { type: Boolean, default: false },
        reviews: [
            {
                photo: { type: String, default: "" },
                name: { type: String, default: "" },
                stars: { type: Number, default: 0, min: 0, max: 5 },
                description: { type: String, default: "" },
            },
        ],
    },
    background: {
        type: String,
        enum: ["white", "dark"],
        default: "white",
    },
    colors: {
        type: String,
        enum: [
            "#8B5CF6",
            "#1A1A1A",
            "#2196F3",
            "#4CAF50",
            "#FF9800",
            "#E91E63",
        ],
        default: "#FF9800",
    },
    status: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
}, { timestamps: true });
// ✅ Índices importantes para performance
CheckoutSchema.index({ userId: 1 });
CheckoutSchema.index({ productId: 1 });
CheckoutSchema.index({ createdAt: -1 });
exports.Checkout = mongoose_1.default.model("Checkout", CheckoutSchema);
