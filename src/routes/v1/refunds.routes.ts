// src/routes/v1/refunds.routes.ts
import { Router } from "express";
import { createRefund } from "../../controllers/v1/refund.controller";

const router = Router();

router.post("/", createRefund);

export default router;
