// src/routes/v1/testPayments.routes.ts
import { Router } from "express";
import { simulatePaymentPaid, simulatePaymentFailed } from "../../controllers/v1/testPayment.controller";
import { requireScope } from "../../middleware/requireScope";

const router = Router();

router.post("/:id/pay", requireScope("test:write"), simulatePaymentPaid);
router.post("/:id/fail", requireScope("test:write"), simulatePaymentFailed);

export default router;
