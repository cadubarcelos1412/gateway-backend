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
const mongoose_1 = __importStar(require("mongoose"));
/* -------------------------------------------------------------------------- */
/* 🛠️ Schemas auxiliares                                                     */
/* -------------------------------------------------------------------------- */
const AddressSchema = new mongoose_1.Schema({
    street: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    complement: { type: String, trim: true },
    district: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true, minlength: 2, maxlength: 2 },
    country: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 2,
        default: "BR",
    },
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
    name: { type: String, required: true, trim: true },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, "Endereço de e-mail inválido"],
        index: true,
    },
    phone: { type: String, trim: true },
    type: { type: String, enum: ["PF", "PJ"], required: true },
    documentNumber: { type: String, required: true, trim: true, index: true, unique: true },
    address: { type: AddressSchema, required: true },
    financialConfig: {
        type: Object,
        default: {
            acquirer: "pagarme",
            fees: {
                pix: 1.99,
                credit_card: 3.49,
                boleto: 2.99,
            },
            reserve: {
                percent: 10,
                days: 2,
            },
        },
    },
    kycStatus: {
        type: String,
        enum: ["pending", "under_review", "approved", "rejected", "active"],
        default: "pending",
        index: true,
    },
    kycDocuments: { type: Object, default: {} },
    statusHistory: { type: [StatusHistorySchema], default: [] }, // ✅ corrigido aqui
    split: {
        type: Object,
        default: {
            cashIn: {
                pix: { fixed: 0, percentage: 2.99 },
                credit_card: { fixed: 0, percentage: 3.49 },
                boleto: { fixed: 0, percentage: 2.99 },
            },
            cashOut: { pix: { fixed: 0.15, percentage: 0 } },
        },
    },
    status: { type: String, enum: ["active", "suspended", "blocked"], default: "active" },
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
/* 🧪 Hooks com tipagem correta                                              */
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
SellerSchema.index({ "financialConfig.acquirer": 1 });
SellerSchema.index({ name: "text", email: "text" });
/* -------------------------------------------------------------------------- */
/* 📤 Exportação                                                             */
/* -------------------------------------------------------------------------- */
exports.Seller = mongoose_1.default.model("Seller", SellerSchema);
