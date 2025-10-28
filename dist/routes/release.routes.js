"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const release_controller_1 = require("../controllers/release.controller");
const router = (0, express_1.Router)();
/**
 * @route POST /api/release/manual
 * @desc Libera valores do saldo indisponível para o disponível (admin)
 * @access Protegido (precisa de token JWT)
 */
router.post("/manual", release_controller_1.releaseBalance);
exports.default = router;
