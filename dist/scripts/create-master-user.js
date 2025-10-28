"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const user_model_1 = require("../models/user.model");
dotenv_1.default.config();
async function createMasterUser() {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri)
            throw new Error("❌ MONGO_URI não encontrado no .env");
        await mongoose_1.default.connect(uri);
        console.log("✅ Conectado ao MongoDB");
        const hashedPassword = await bcrypt_1.default.hash("SenhaForte123!", 10);
        const user = await user_model_1.User.create({
            name: "Master Admin",
            email: "cadu@kissapay.com",
            password: hashedPassword,
            role: "master",
            status: "active",
            document: "33314665814",
            split: {
                cashIn: {
                    pix: { fixed: 0, percentage: 0 },
                    creditCard: { fixed: 0, percentage: 0 },
                    boleto: { fixed: 0, percentage: 0 },
                },
            },
        });
        console.log("🔥 Usuário master criado com sucesso!");
        console.log("📄 ID:", user._id);
    }
    catch (err) {
        console.error("❌ Erro ao criar usuário:", err);
    }
    finally {
        process.exit();
    }
}
createMasterUser();
