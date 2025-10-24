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
exports.Seller = void 0;
// src/models/seller.model.ts
const mongoose_1 = __importStar(require("mongoose"));
/* -------------------------------------------------------------------------- */
/* 🛠️ Schemas auxiliares                                                     */
/* -------------------------------------------------------------------------- */
const DocumentFileSchema = new mongoose_1.Schema({
    url: { type: String, required: true, trim: true },
    uploadedAt: { type: Date, required: true, default: () => new Date() },
    mimeType: { type: String, trim: true },
    checksum: { type: String, trim: true },
}, { _id: false });
const KycDocumentsSchema = new mongoose_1.Schema({
    rgFront: { type: DocumentFileSchema },
    rgBack: { type: DocumentFileSchema },
    cpf: { type: DocumentFileSchema },
    cnpjDoc: { type: DocumentFileSchema },
    articlesOfAssociation: { type: DocumentFileSchema },
    powerOfAttorney: { type: DocumentFileSchema },
    proofOfAddress: { type: DocumentFileSchema },
}, { _id: false });
const AddressSchema = new mongoose_1.Schema({
    street: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    complement: { type: String, trim: true },
    district: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true, minlength: 2, maxlength: 2 },
    country: { type: String, required: true, trim: true, minlength: 2, maxlength: 2, default: "BR" },
    postalCode: { type: String, required: true, trim: true },
}, { _id: false });
const StatusHistorySchema = new mongoose_1.Schema({
    from: { type: String, enum: ["pending", "under_review", "approved", "rejected", "active"], required: true },
    to: { type: String, enum: ["pending", "under_review", "approved", "rejected", "active"], required: true },
    changedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, trim: true },
    changedAt: { type: Date, default: () => new Date() },
}, { _id: false });
/* -------------------------------------------------------------------------- */
/* 🏦 Schema principal de Seller                                             */
/* -------------------------------------------------------------------------- */
const SellerSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, "Endereço de email inválido"],
        index: true,
    },
    phone: { type: String, trim: true },
    type: { type: String, enum: ["PF", "PJ"], required: true },
    documentNumber: {
        type: String,
        required: true,
        trim: true,
        index: true,
        unique: true,
    },
    address: { type: AddressSchema, required: true },
    // 🏦 Multiadquirência – cada seller pode ter sua adquirente configurada
    acquirer: {
        type: String,
        enum: ["pagarme", "stripe", "reflowpay"],
        default: "pagarme",
        required: true,
        index: true,
    },
    kycStatus: {
        type: String,
        enum: ["pending", "under_review", "approved", "rejected", "active"],
        default: "pending",
        index: true,
    },
    kycDocuments: { type: KycDocumentsSchema, default: {} },
    statusHistory: { type: [StatusHistorySchema], default: [] },
    split: {
        type: Object,
        default: {
            cashIn: {
                pix: { fixed: 0, percentage: 2.99 },
                credit_card: { fixed: 0, percentage: 3.49 },
                boleto: { fixed: 0, percentage: 2.99 },
            },
            cashOut: {
                pix: { fixed: 0.15, percentage: 0 },
            },
        },
    },
    status: {
        type: String,
        enum: ["active", "suspended", "blocked"],
        default: "active",
    },
}, {
    timestamps: true,
    versionKey: false,
    toJSON: {
        virtuals: true,
        transform: (_doc, ret) => {
            ret.id = ret._id?.toString();
            delete ret._id;
            return ret;
        },
    },
});
/* -------------------------------------------------------------------------- */
/* 🧪 Validações pré-salvar                                                  */
/* -------------------------------------------------------------------------- */
SellerSchema.pre("validate", function (next) {
    const onlyDigits = (v) => (v || "").replace(/\D+/g, "");
    if (this.documentNumber)
        this.documentNumber = onlyDigits(this.documentNumber);
    if (this.phone)
        this.phone = onlyDigits(this.phone);
    if (this.address?.postalCode)
        this.address.postalCode = onlyDigits(this.address.postalCode);
    next();
});
SellerSchema.pre("save", function (next) {
    if (this.name)
        this.name = this.name.trim();
    if (this.email)
        this.email = this.email.trim().toLowerCase();
    next();
});
/* -------------------------------------------------------------------------- */
/* 📊 Índices estratégicos                                                   */
/* -------------------------------------------------------------------------- */
SellerSchema.index({ userId: 1, kycStatus: 1 });
SellerSchema.index({ name: "text", email: "text" });
SellerSchema.index({ acquirer: 1 });
/* -------------------------------------------------------------------------- */
/* 📤 Exportação                                                             */
/* -------------------------------------------------------------------------- */
exports.Seller = mongoose_1.default.model("Seller", SellerSchema);
