// src/routes/v1/testPayments.routes.ts
import { Router } from "express";
import { simulatePaymentPaid, simulatePaymentFailed } from "../../controllers/v1/testPayment.controller";

const router = Router();

router.post("/:id/pay", simulatePaymentPaid);
router.post("/:id/fail", simulatePaymentFailed);

export default router;
