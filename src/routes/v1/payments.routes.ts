// src/routes/v1/payments.routes.ts
import { Router } from "express";
import { createPayment, getPayment, listPayments } from "../../controllers/v1/payment.controller";
import { idempotency } from "../../middleware/idempotency";

const router = Router();

router.post("/", idempotency, createPayment);
router.get("/:id", getPayment);
router.get("/", listPayments);

export default router;
