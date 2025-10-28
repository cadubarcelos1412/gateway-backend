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
const TransactionSchema = new mongoose_1.Schema({
    sellerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Seller",
        required: true,
        index: true
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User"
    },
    productId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Product"
    },
    externalId: {
        type: String,
        index: true,
        sparse: true
    },
    orderId: {
        type: String,
        index: true,
        sparse: true
    },
    chargeId: {
        type: String,
        index: true,
        sparse: true
    },
    transactionId: {
        type: String,
        index: true,
        sparse: true
    },
    gatewayId: {
        type: String
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    netAmount: {
        type: Number,
        min: 0
    },
    fee: {
        type: Number,
        min: 0,
        default: 0
    },
    method: {
        type: String,
        enum: ["pix", "credit_card", "boleto", "debit_card"],
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ["pending", "approved", "failed", "refunded", "waiting_payment"],
        default: "pending",
        index: true
    },
    description: {
        type: String,
        trim: true
    },
    flags: [{
            type: String,
            trim: true
        }],
    metadata: {
        ipAddress: { type: String },
        deviceId: { type: String },
        userAgent: { type: String },
    },
    pixData: {
        qrCode: { type: String },
        qrCodeUrl: { type: String },
        expiresAt: { type: Date },
        pixProviderTid: { type: String },
    },
    cardData: {
        lastFourDigits: { type: String, maxlength: 4 },
        brand: { type: String, lowercase: true },
        holderName: { type: String, uppercase: true },
        installments: { type: Number, min: 1, default: 1 },
    },
    purchaseData: {
        products: [
            {
                id: String,
                name: String,
                price: { type: Number, min: 0 },
                quantity: { type: Number, min: 1 },
            },
        ],
        customer: {
            name: String,
            email: { type: String, lowercase: true },
            document: String,
            documentType: { type: String, enum: ["CPF", "CNPJ"] },
            phone: String,
            ip: String,
        },
    },
    trackingParameters: {
        utm_source: String,
        utm_medium: String,
        utm_campaign: String,
        utm_content: String,
        utm_term: String,
    },
    webhookEvents: [
        {
            event: { type: String, required: true },
            receivedAt: { type: Date, default: Date.now },
            data: mongoose_1.Schema.Types.Mixed,
        },
    ],
    paidAt: { type: Date },
    canceledAt: { type: Date },
    refundedAt: { type: Date },
}, {
    timestamps: true
});
// 🔍 Índices compostos
TransactionSchema.index({ sellerId: 1, status: 1 });
TransactionSchema.index({ sellerId: 1, createdAt: -1 });
TransactionSchema.index({ externalId: 1, orderId: 1 });
// 🔍 Índice de texto
TransactionSchema.index({
    description: 'text',
    'purchaseData.customer.name': 'text',
    'purchaseData.customer.email': 'text'
});
// 🎯 Virtual para verificar se está expirado
TransactionSchema.virtual('isExpired').get(function () {
    if (this.pixData?.expiresAt) {
        return new Date() > this.pixData.expiresAt;
    }
    return false;
});
// 💰 Virtual para calcular valor líquido
TransactionSchema.virtual('calculatedNetAmount').get(function () {
    if (this.netAmount !== undefined) {
        return this.netAmount;
    }
    return this.amount - (this.fee || 0);
});
// 🔄 Método para adicionar evento de webhook
TransactionSchema.methods.addWebhookEvent = function (event, data) {
    if (!this.webhookEvents) {
        this.webhookEvents = [];
    }
    this.webhookEvents.push({
        event,
        receivedAt: new Date(),
        data,
    });
    return this.save();
};
// 🎯 Método para atualizar status
TransactionSchema.methods.updateStatus = function (newStatus) {
    this.status = newStatus;
    switch (newStatus) {
        case 'approved':
            this.paidAt = new Date();
            break;
        case 'failed':
            this.canceledAt = new Date();
            break;
        case 'refunded':
            this.refundedAt = new Date();
            break;
    }
    return this.save();
};
exports.Transaction = mongoose_1.default.model("Transaction", TransactionSchema);
