// src/routes/payment.routes.ts
import { Router } from "express";
import { createPixPayment } from "../controllers/payment.controller";

const router = Router();

// 💳 Pagamento PIX (Pagar.me V5)
router.post("/pix", createPixPayment);

// ✅ Exportação padrão (necessária para o import default do index.ts)
export default router;
