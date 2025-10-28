"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Subaccount = void 0;
// src/models/subaccount.model.ts
const mongoose_1 = require("mongoose");
const SubaccountSchema = new mongoose_1.Schema({
    sellerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Seller",
        required: true,
        unique: true, // cada seller tem apenas UMA subconta
        index: true,
    },
    balance: {
        available: { type: Number, default: 0 },
        retained: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
    },
    settlementConfig: {
        method: { type: String, enum: ["manual", "auto"], default: "manual" },
        minPayout: { type: Number, default: 100 },
    },
}, { timestamps: true, versionKey: false });
exports.Subaccount = (0, mongoose_1.model)("Subaccount", SubaccountSchema);
