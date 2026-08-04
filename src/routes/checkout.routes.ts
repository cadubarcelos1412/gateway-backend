import { Router } from "express";
import {
  createCheckout,
  getCheckout,
  getPublicCheckout,
  updateCheckout,
  deleteCheckout,
  getZendryThreedsToken
} from "../controllers/checkout.controller";
import { renderCheckoutPreview } from "../controllers/checkout.preview";
import { payCheckout } from "../controllers/checkout.pay.controller";

const router = Router();

/**
 * 🛒 Criar novo checkout
 * @route POST /api/checkout/create
 */
router.post("/create", createCheckout);

/**
 * 🔐 Obter checkout autenticado (precisa de token)
 * @route GET /api/checkout
 */
router.get("/", getCheckout);

/**
 * 🌐 Obter checkout público (sem token)
 * @route GET /api/checkout/public?id=...
 */
router.get("/public", getPublicCheckout);

/**
 * 🔄 Atualizar checkout
 * @route PATCH /api/checkout
 */
router.patch("/", updateCheckout);

/**
 * ❌ Deletar checkout
 * @route DELETE /api/checkout
 */
router.delete("/", deleteCheckout);

/**
 * 👁️ Pré-visualizar checkout
 * @route GET /api/checkout/preview
 */
router.get("/preview", renderCheckoutPreview);

/**
 * 💳 Realizar pagamento de um checkout
 * @route POST /api/checkout/pay
 */
router.post("/pay", payCheckout);

/**
 * 🔐 Token da Zendry pro SDK de 3DS (público — roda no navegador do comprador,
 * antes de qualquer autenticação)
 * @route GET /api/checkout/zendry-3ds-token
 */
router.get("/zendry-3ds-token", getZendryThreedsToken);

export default router;
