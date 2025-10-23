import { Router } from "express";

// 📁 Importações de rotas
import userRoutes from "./user.routes";
import transactionRoutes from "./transaction.routes";
import cashoutRoutes from "./cashout.routes";
import walletRoutes from "./wallet.routes";
import checkoutRoutes from "./checkout.routes";
import productRoutes from "./products.routes";
import reportRoutes from "./report.routes";
import volumeRoutes from "./volume.routes";
import retentionPolicyRoutes from "./retentionPolicy.routes";
import masterRoutes from "./master.routes";
import sellerRoutes from "./seller.routes";
import uploadRoutes from "./upload.routes";
import subaccountRoutes from "./subaccount.routes";
import reserveRoutes from "./reserve.routes"; // ✅ nova rota

const router = Router();

// 🌐 Rotas principais
router.use("/users", userRoutes);
router.use("/transactions", transactionRoutes);
router.use("/cashout", cashoutRoutes);
router.use("/wallet", walletRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/products", productRoutes);
router.use("/reports", reportRoutes);
router.use("/reports/volume", volumeRoutes);
router.use("/retention", retentionPolicyRoutes);
router.use("/sellers", sellerRoutes);
router.use("/subaccounts", subaccountRoutes);
router.use("/upload", uploadRoutes);
router.use("/master", masterRoutes);
router.use("/reserve", reserveRoutes); // ✅ adicionado

// fallback
router.use("*", (_req, res) => {
  res.status(404).json({
    status: false,
    msg: "Rota não encontrada. Verifique o endpoint.",
  });
});

export default router;
