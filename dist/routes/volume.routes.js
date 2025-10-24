"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const volume_controller_1 = require("../controllers/volume.controller");
const router = (0, express_1.Router)();
// 📆 Volume diário – para gráfico de linha
router.get("/daily", volume_controller_1.getDailyVolume);
// 📅 Volume mensal – para gráfico de barras
router.get("/monthly", volume_controller_1.getMonthlyVolume);
exports.default = router;
