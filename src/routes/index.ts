// src/routes/index.ts
import { Router } from "express";

// 🔹 Importação de rotas do sistema
import kycRoutes from "./kyc.routes";
import paymentRoutes from "./payment.routes";
import userRoutes from "./user.routes";
// import authRoutes from "./auth.routes";
// import sellerRoutes from "./seller.routes";
// import transactionRoutes from "./transaction.routes";
// import walletRoutes from "./wallet.routes";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 💳 ROTAS DE PAGAMENTOS (PAGAR.ME V5)                                       */
/* -------------------------------------------------------------------------- */
router.use("/payments", paymentRoutes);

/* -------------------------------------------------------------------------- */
/* 🧾 ROTAS DE KYC (Validação de Identidade)                                 */
/* -------------------------------------------------------------------------- */
router.use("/kyc", kycRoutes);

/* -------------------------------------------------------------------------- */
/* 👤 ROTAS DE USUÁRIOS (Login, Registro, Perfil, etc.)                      */
/* -------------------------------------------------------------------------- */
router.use("/users", userRoutes);

/* -------------------------------------------------------------------------- */
/* 🔐 OUTRAS ROTAS (Descomente conforme forem implementadas)                 */
/* -------------------------------------------------------------------------- */
// router.use("/auth", authRoutes);
// router.use("/sellers", sellerRoutes);
// router.use("/transactions", transactionRoutes);
// router.use("/wallet", walletRoutes);

/* -------------------------------------------------------------------------- */
/* ✅ EXPORTAÇÃO                                                            */
/* -------------------------------------------------------------------------- */
export default router;
