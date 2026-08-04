// src/routes/v1/index.ts
import { Router } from "express";
import { authApiKey } from "../../middleware/authApiKey";
import { apiKeyRateLimit } from "../../middleware/apiKeyRateLimit";
import accountRoutes from "./account.routes";
import paymentsRoutes from "./payments.routes";
import refundsRoutes from "./refunds.routes";
import testPaymentsRoutes from "./testPayments.routes";
import webhookEndpointsRoutes from "./webhookEndpoints.routes";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🌐 API pública v1 — autenticada por API key (sk_...), separada do painel  */
/* interno do dashboard.                                                     */
/* -------------------------------------------------------------------------- */
router.use(authApiKey);
router.use(apiKeyRateLimit);

router.use("/account", accountRoutes);
router.use("/payments", paymentsRoutes);
router.use("/refunds", refundsRoutes);
router.use("/test/payments", testPaymentsRoutes);
router.use("/webhook_endpoints", webhookEndpointsRoutes);

router.use("*", (_req, res) => {
  res.status(404).json({
    error: {
      type: "invalid_request_error",
      code: "not_found",
      message: "Endpoint não encontrado.",
    },
  });
});

export default router;
