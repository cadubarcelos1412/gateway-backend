// src/routes/index.ts
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
import subaccountRoutes from "./subaccount.routes"; // ✅ novo módulo de subcontas

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🌐 ROTAS PRINCIPAIS DA API */
/* -------------------------------------------------------------------------- */

// 🧑‍💻 Usuários e autenticação
router.use("/users", userRoutes);

// 💸 Transações e financeiro
router.use("/transactions", transactionRoutes);
router.use("/cashout", cashoutRoutes);
router.use("/wallet", walletRoutes);

// 🛒 Checkout e produtos
router.use("/checkout", checkoutRoutes);
router.use("/products", productRoutes);

// 📊 Relatórios e retenção
router.use("/reports", reportRoutes);
router.use("/reports/volume", volumeRoutes);
router.use("/retention", retentionPolicyRoutes);

// 🛡️ Sellers, administração e subcontas
router.use("/sellers", sellerRoutes);
router.use("/subaccounts", subaccountRoutes); // ✅ consulta da subconta vinculada ao seller

// 📤 Upload de documentos KYC (rota separada para não conflitar com /sellers)
router.use("/upload", uploadRoutes);

// 👑 Administração geral
router.use("/master", masterRoutes);

/* -------------------------------------------------------------------------- */
/* 🔁 Fallback – rota inexistente */
/* -------------------------------------------------------------------------- */
router.use("*", (_req, res) => {
  res.status(404).json({
    status: false,
    msg: "Rota não encontrada. Verifique o endpoint.",
  });
});

export default router;
