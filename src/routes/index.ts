import { Router } from "express";
import kycRoutes from "./kyc.routes";
import paymentRoutes from "./payment.routes";
// Importe outras rotas conforme necessário
// import transactionRoutes from "./transaction.routes";
// import sellerRoutes from "./seller.routes";
// import userRoutes from "./user.routes";
// import authRoutes from "./auth.routes";
// import walletRoutes from "./wallet.routes";

const router = Router();

// 💳 Pagamentos (PAGAR.ME V5) - PRIORIDADE
router.use("/payments", paymentRoutes);

// 🔍 KYC
router.use("/kyc", kycRoutes);

// Adicione outras rotas conforme necessário:
// router.use("/auth", authRoutes);
// router.use("/users", userRoutes);
// router.use("/sellers", sellerRoutes);
// router.use("/transactions", transactionRoutes);
// router.use("/wallet", walletRoutes);

export default router;