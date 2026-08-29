import { Router } from "express";
import {
  createCheckout,
  createQuickPaymentLink,
  getCheckout,
  getPublicCheckout,
  updateCheckout,
  deleteCheckout,
  getZendryThreedsToken
} from "../controllers/checkout.controller";
import { renderCheckoutPreview } from "../controllers/checkout.preview";
import { payCheckout } from "../controllers/checkout.pay.controller";
import { sensitiveActionRateLimit } from "../middleware/authRateLimit";

const router = Router();

/**
 * 🛒 Criar novo checkout
 * @route POST /api/checkout/create
 */
router.post("/create", createCheckout);

/**
 * ⚡ Criar link de pagamento rápido (Produto + Checkout numa chamada só)
 * @route POST /api/checkout/quick-link
 */
router.post("/quick-link", createQuickPaymentLink);

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
// 🔒 sensitiveActionRateLimit (achado de auditoria de segurança 2026-08-30)
// — endpoint público, sem token, que move dinheiro (cartão/Pix); não tinha
// limite nenhum antes.
router.post("/pay", sensitiveActionRateLimit, payCheckout);

/**
 * 🔐 Token da Zendry pro SDK de 3DS (público — roda no navegador do comprador,
 * antes de qualquer autenticação)
 * @route GET /api/checkout/zendry-3ds-token
 */
router.get("/zendry-3ds-token", getZendryThreedsToken);

export default router;
