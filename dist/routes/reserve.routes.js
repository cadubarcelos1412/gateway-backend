"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reserve_controller_1 = require("../controllers/reserve.controller");
const router = (0, express_1.Router)();
/**
 * @route POST /api/reserve/release
 * @desc Libera manualmente reservas de risco (somente master)
 * @access Restrito (Bearer Token com role=master)
 */
router.post("/release", reserve_controller_1.releaseReserve);
exports.default = router;
