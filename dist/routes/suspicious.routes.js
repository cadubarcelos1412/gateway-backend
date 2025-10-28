"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const suspicious_controller_1 = require("../controllers/suspicious.controller");
const router = (0, express_1.Router)();
/* 🚨 Transações suspeitas */
router.get("/", suspicious_controller_1.getSuspiciousTransactions);
router.post("/review", suspicious_controller_1.reviewSuspiciousTransaction);
exports.default = router;
