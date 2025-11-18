import { Router } from "express";

/* ==========================================================================
   📦 IMPORTAÇÃO DE TODAS AS ROTAS DO SISTEMA
   ========================================================================== */

// 🔐 Autenticação / Usuários
import userRoutes from "./user.routes";

// 👤 Sellers
import sellerRoutes from "./seller.routes";

// 🧩 KYC
import kycRoutes from "./kyc.routes";

// 💳 Pagamentos (Pagar.me)
import paymentRoutes from "./payment.routes";

// 💼 Wallet / Saldo
import walletRoutes from "./wallet.routes";

// 🧾 Transações
import transactionRoutes from "./transaction.routes";

// 🛒 Checkout
import checkoutRoutes from "./checkout.routes";

// 🏦 Subcontas
import subaccountRoutes from "./subaccount.routes";

// 🧱 Reserva financeira
import reserveRoutes from "./reserve.routes";

// 🔓 Release (liberação)
import releaseRoutes from "./release.routes";

// 🛡 Retenção (risk engine)
import retentionRoutes from "./retention.routes";

// 📦 Produtos
import productsRoutes from "./products.routes";

// 💸 Cashout (saques normais)
import cashoutRoutes from "./cashout.routes";

// 📊 Volume / Dashboard
import volumeRoutes from "./volume.routes";

// 🪝 Webhooks
import webhookRoutes from "./webhook.routes";

// 🖼 Imagens
import imageRoutes from "./images.routes";

// 📤 Uploads
import uploadRoutes from "./upload.routes";

// 🪙 Crypto Cashout
import cryptoRoutes from "./crypto.routes";

// 🚨 Suspeitas (fraudes)
import suspiciousRoutes from "./suspicious.routes";

// 🧠 Score (Risk score engine)
import scoreRoutes from "./score.routes";

// 🧪 Test API (debug)
import testRoutes from "./test.routes";


/* ==========================================================================
   🚀 DEFINIÇÃO DO ROUTER PRINCIPAL
   ========================================================================== */

const router = Router();

/* ==========================================================================
   🔗 REGISTRO DE TODAS AS ROTAS (com prefixo /api no server.ts)
   ========================================================================== */

// 🧪 TESTE / STATUS
router.use("/test", testRoutes);

// 👤 Usuários
router.use("/users", userRoutes);

// 👤 Sellers
router.use("/sellers", sellerRoutes);

// 🧩 KYC
router.use("/kyc", kycRoutes);

// 💳 Pagamentos
router.use("/payments", paymentRoutes);

// 💼 Wallet
router.use("/wallet", walletRoutes);

// 🧾 Transações
router.use("/transactions", transactionRoutes);

// 🛒 Checkout
router.use("/checkout", checkoutRoutes);

// 🏦 Subcontas
router.use("/subaccount", subaccountRoutes);

// 🧱 Reserva Financeira
router.use("/reserve", reserveRoutes);

// 🔓 Release (liberação)
router.use("/release", releaseRoutes);

// 🛡 Retenção
router.use("/retention", retentionRoutes);

// 📦 Produtos
router.use("/products", productsRoutes);

// 💸 Saques (cashout normal)
router.use("/cashout", cashoutRoutes);

// 📊 Volume
router.use("/volume", volumeRoutes);

// 🪝 Webhooks
router.use("/hooks", webhookRoutes);

// 🖼 Imagens
router.use("/images", imageRoutes);

// 📤 Uploads
router.use("/upload", uploadRoutes);

// 🪙 Crypto Cashout
router.use("/crypto", cryptoRoutes);

// 🚨 Fraude / Suspeitas
router.use("/suspicious", suspiciousRoutes);

// 🧠 Score (risk engine)
router.use("/score", scoreRoutes);


/* ==========================================================================
   📤 EXPORTAÇÃO
   ========================================================================== */

export default router;
