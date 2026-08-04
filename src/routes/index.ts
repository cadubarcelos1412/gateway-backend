// src/routes/index.ts
import { Router } from "express";

// 📁 Importações de rotas principais
import userRoutes from "./user.routes";
import meRoutes from "./me.routes";
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
import kycRoutes from "./kyc.routes";
import imagesRoutes from "./images.routes";
import apiKeysRoutes from "./apiKeys.routes";
import webhookEndpointsRoutes from "./webhookEndpoints.routes";

// 📦 Nova rota: Webhook de Cashout Bancário (confirmação de liquidação Pix/TED)
import cashoutWebhookRoutes from "./cashoutWebhook.routes";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🌐 ROTAS PRINCIPAIS DA API                                                 */
/* -------------------------------------------------------------------------- */

// 🧑‍💻 Usuários e autenticação
router.use("/users", userRoutes);

// 👤 "Meus recursos" do usuário autenticado (me, wallet, transactions, products, checkouts, credentials)
router.use("/user", meRoutes);

// 💸 Transações, saques e financeiro
router.use("/transactions", transactionRoutes);
router.use("/cashouts", cashoutRoutes);
router.use("/wallet", walletRoutes);
router.use("/cashouts/webhook", cashoutWebhookRoutes); // ✅ Webhook bancário (Pix/TED)

// 🛒 Checkout e produtos
router.use("/checkout", checkoutRoutes);
router.use("/products", productRoutes);

// 📊 Relatórios e políticas
router.use("/reports", reportRoutes);
router.use("/reports/volume", volumeRoutes);
router.use("/retention", retentionPolicyRoutes);

// 🛡️ Sellers, subcontas e administração
router.use("/sellers", sellerRoutes);
router.use("/subaccounts", subaccountRoutes);

// 📤 Upload de documentos KYC
router.use("/upload", uploadRoutes);

// 🪪 KYC de sellers (upload/list/status) — existia mas nunca tinha sido montada
router.use("/", kycRoutes);

// 🖼️ Upload de imagens (banner/logo do checkout) — existia mas nunca tinha sido montada
router.use("/images", imagesRoutes);

// 👑 Administração geral
router.use("/master", masterRoutes);

// 🔑 Chaves de API do seller (painel "Desenvolvedores", autenticado por JWT)
router.use("/developers/api-keys", apiKeysRoutes);
router.use("/developers/webhook-endpoints", webhookEndpointsRoutes);

/* -------------------------------------------------------------------------- */
/* 🔁 Fallback – Rota inexistente                                             */
/* -------------------------------------------------------------------------- */
router.use("*", (_req, res) => {
  res.status(404).json({
    status: false,
    msg: "Rota não encontrada. Verifique o endpoint.",
  });
});

export default router;
