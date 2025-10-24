"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionLogger = void 0;
const transactionAudit_model_1 = require("../models/transactionAudit.model");
const seller_model_1 = require("../models/seller.model");
const auth_1 = require("../config/auth");
const MAX_AMOUNT = Number(process.env.MAX_TRANSACTION_AMOUNT) || 50000;
const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS) || 3;
const transactionLogger = async (req, res, next) => {
    res.on("finish", async () => {
        try {
            // 🚦 Só loga se for rota de transações
            if (!req.originalUrl.includes("/transactions"))
                return;
            // 🔑 Decodifica token e encontra seller
            const rawToken = req.headers.authorization?.replace("Bearer ", "");
            const payload = rawToken ? await (0, auth_1.decodeToken)(rawToken) : undefined;
            const seller = payload?.id ? await seller_model_1.Seller.findOne({ userId: payload.id }) : null;
            // 🧾 Dados principais da transação
            const transactionId = res.locals?.transactionId;
            const amount = req.body.amount;
            const method = req.body.method; // agora suportando "credit_card"
            const status = res.statusCode >= 400 ? "failed" : "pending";
            const description = req.body.description;
            // 🌐 IP e dispositivo do comprador
            const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
                req.ip ||
                "unknown";
            const userAgent = req.headers["user-agent"] || "unknown";
            // 🚨 Detecção de flags de risco
            const flags = [];
            // KYC não aprovado
            if (!seller || (seller.kycStatus !== "approved" && seller.kycStatus !== "active")) {
                flags.push("NO_KYC");
            }
            // Valor acima do limite
            if (amount > MAX_AMOUNT) {
                flags.push("HIGH_AMOUNT");
            }
            // IP privado (incomum para checkout real)
            if (ip.startsWith("10.") || ip.startsWith("192.168")) {
                flags.push("SUSPICIOUS_IP");
            }
            // Tentativa falha
            if (res.statusCode >= 400) {
                flags.push("FAILED_ATTEMPT");
            }
            // ⚠️ Futuro: contador de falhas para bloqueio (Redis ou memória)
            if (flags.includes("FAILED_ATTEMPT")) {
                // TODO: implementar contador em cache para bloquear após MAX_FAILED_ATTEMPTS
            }
            // 🧠 Registro de auditoria
            await transactionAudit_model_1.TransactionAudit.create({
                transactionId,
                sellerId: seller?._id,
                userId: payload?.id,
                amount,
                method, // ✅ aceita "credit_card" agora
                status,
                description,
                kycStatus: seller?.kycStatus || "unknown",
                ipAddress: ip,
                userAgent,
                flags,
                createdAt: new Date(),
            });
            console.log("📊 TransactionAudit registrado com sucesso:", {
                transactionId,
                sellerId: seller?._id,
                flags,
            });
        }
        catch (err) {
            console.error("⚠️ Falha ao registrar TransactionAudit:", err);
        }
    });
    next();
};
exports.transactionLogger = transactionLogger;
