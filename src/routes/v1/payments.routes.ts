// src/routes/v1/payments.routes.ts
import { Router } from "express";
import { createPayment, getPayment, listPayments } from "../../controllers/v1/payment.controller";
import { idempotency } from "../../middleware/idempotency";
import { requireScope } from "../../middleware/requireScope";

const router = Router();

router.post("/", requireScope("payments:write"), idempotency, createPayment);
router.get("/:id", requireScope("payments:read"), getPayment);
router.get("/", requireScope("payments:read"), listPayments);

export default router;
