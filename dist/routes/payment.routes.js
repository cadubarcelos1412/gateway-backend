"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/payment.routes.ts
const express_1 = require("express");
const payment_controller_1 = require("../controllers/payment.controller");
const router = (0, express_1.Router)();
// 💳 Pagamento PIX (Pagar.me V5)
router.post("/pix", payment_controller_1.createPixPayment);
// ✅ Exportação padrão (necessária para o import default do index.ts)
exports.default = router;
