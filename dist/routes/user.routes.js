"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("../controllers/user.controller");
const router = (0, express_1.Router)();
/* --------------------------------------------------------------------------
 👤 USERS ROUTES
 Prefixo base: /api/users
--------------------------------------------------------------------------- */
/**
 * 🆕 Registra um novo usuário
 */
router.post("/register", (req, res) => {
    (0, user_controller_1.registerUser)(req, res);
});
/**
 * 🔐 Login de usuário
 */
router.post("/login", (req, res) => {
    (0, user_controller_1.loginUser)(req, res);
});
/**
 * 👑 Cria novo admin
 */
router.post("/admin", (req, res) => {
    (0, user_controller_1.createAdminUser)(req, res);
});
/**
 * 💸 Atualiza split fees
 */
router.patch("/:id/split", (req, res) => {
    (0, user_controller_1.updateSplitFees)(req, res);
});
/**
 * 📊 Retorna split fees
 */
router.get("/:id/split", (req, res) => {
    (0, user_controller_1.getSplitFees)(req, res);
});
/* -------------------------------------------------------------------------- */
exports.default = router;
