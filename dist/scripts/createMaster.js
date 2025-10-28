"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const user_model_1 = require("../models/user.model");
(async () => {
    try {
        await mongoose_1.default.connect(process.env.MONGO_URI);
        console.log("📡 Conectado ao MongoDB");
        const masterData = {
            name: "Master Kaduuuuu",
            email: "kadukadu@teste.com.br",
            password: await bcryptjs_1.default.hash("SenhaForte123!", 10), // 🔐 Criptografa antes de salvar
            role: "master",
            status: "active",
            document: "38144992040",
        };
        const exists = await user_model_1.User.findOne({ role: "master" }).lean();
        if (exists) {
            console.log("⚠️ Já existe um usuário master no banco:");
            console.log(`📧 Email: ${exists.email}`);
            console.log(`🆔 ID: ${exists._id}`);
            process.exit(0);
        }
        const masterUser = await user_model_1.User.create(masterData);
        console.log("\n✅ Usuário MASTER criado com sucesso!");
        console.log(`📧 Email: ${masterUser.email}`);
        console.log(`🆔 ID: ${masterUser._id}`);
        console.log("🔑 Senha: SenhaForte123!");
        process.exit(0);
    }
    catch (error) {
        console.error("❌ Erro ao criar usuário master:", error);
        process.exit(1);
    }
})();
