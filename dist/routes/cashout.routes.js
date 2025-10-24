"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cashout_controller_1 = require("../controllers/cashout.controller");
const router = express_1.default.Router();
/**
 * 💸 Rotas de Cashout (saques)
 * Protegidas — apenas master/admin pode aprovar/rejeitar.
 */
// 1️⃣ Criar solicitação de saque (seller)
router.post("/create", cashout_controller_1.createCashout);
// 2️⃣ Aprovar solicitação (master/admin)
router.post("/approve", cashout_controller_1.approveCashout);
// 3️⃣ Rejeitar solicitação (master/admin)
router.post("/reject", cashout_controller_1.rejectCashout);
exports.default = router;
