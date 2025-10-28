"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/index.ts
const express_1 = require("express");
// 🔹 Importação de rotas do sistema
const kyc_routes_1 = __importDefault(require("./kyc.routes"));
const payment_routes_1 = __importDefault(require("./payment.routes"));
const user_routes_1 = __importDefault(require("./user.routes"));
// import authRoutes from "./auth.routes";
// import sellerRoutes from "./seller.routes";
// import transactionRoutes from "./transaction.routes";
// import walletRoutes from "./wallet.routes";
const router = (0, express_1.Router)();
/* -------------------------------------------------------------------------- */
/* 💳 ROTAS DE PAGAMENTOS (PAGAR.ME V5)                                       */
/* -------------------------------------------------------------------------- */
router.use("/payments", payment_routes_1.default);
/* -------------------------------------------------------------------------- */
/* 🧾 ROTAS DE KYC (Validação de Identidade)                                 */
/* -------------------------------------------------------------------------- */
router.use("/kyc", kyc_routes_1.default);
/* -------------------------------------------------------------------------- */
/* 👤 ROTAS DE USUÁRIOS (Login, Registro, Perfil, etc.)                      */
/* -------------------------------------------------------------------------- */
router.use("/users", user_routes_1.default);
/* -------------------------------------------------------------------------- */
/* 🔐 OUTRAS ROTAS (Descomente conforme forem implementadas)                 */
/* -------------------------------------------------------------------------- */
// router.use("/auth", authRoutes);
// router.use("/sellers", sellerRoutes);
// router.use("/transactions", transactionRoutes);
// router.use("/wallet", walletRoutes);
/* -------------------------------------------------------------------------- */
/* ✅ EXPORTAÇÃO                                                            */
/* -------------------------------------------------------------------------- */
exports.default = router;
