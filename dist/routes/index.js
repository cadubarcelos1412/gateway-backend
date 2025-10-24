"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
// 📁 Importações de rotas
const user_routes_1 = __importDefault(require("./user.routes"));
const transaction_routes_1 = __importDefault(require("./transaction.routes"));
const cashout_routes_1 = __importDefault(require("./cashout.routes"));
const wallet_routes_1 = __importDefault(require("./wallet.routes"));
const checkout_routes_1 = __importDefault(require("./checkout.routes"));
const products_routes_1 = __importDefault(require("./products.routes"));
const report_routes_1 = __importDefault(require("./report.routes"));
const volume_routes_1 = __importDefault(require("./volume.routes"));
const retentionPolicy_routes_1 = __importDefault(require("./retentionPolicy.routes"));
const master_routes_1 = __importDefault(require("./master.routes"));
const seller_routes_1 = __importDefault(require("./seller.routes"));
const upload_routes_1 = __importDefault(require("./upload.routes"));
const subaccount_routes_1 = __importDefault(require("./subaccount.routes"));
const reserve_routes_1 = __importDefault(require("./reserve.routes")); // ✅ nova rota
const router = (0, express_1.Router)();
// 🌐 Rotas principais
router.use("/users", user_routes_1.default);
router.use("/transactions", transaction_routes_1.default);
router.use("/cashout", cashout_routes_1.default);
router.use("/wallet", wallet_routes_1.default);
router.use("/checkout", checkout_routes_1.default);
router.use("/products", products_routes_1.default);
router.use("/reports", report_routes_1.default);
router.use("/reports/volume", volume_routes_1.default);
router.use("/retention", retentionPolicy_routes_1.default);
router.use("/sellers", seller_routes_1.default);
router.use("/subaccounts", subaccount_routes_1.default);
router.use("/upload", upload_routes_1.default);
router.use("/master", master_routes_1.default);
router.use("/reserve", reserve_routes_1.default); // ✅ adicionado
// fallback
router.use("*", (_req, res) => {
    res.status(404).json({
        status: false,
        msg: "Rota não encontrada. Verifique o endpoint.",
    });
});
exports.default = router;
