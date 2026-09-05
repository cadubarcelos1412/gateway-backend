import { Router } from "express";
import {
  getKpas,
  getAnalytics,
  generateMasterToken,
  validateMasterToken,
  getMostSaleProducts,
  listTransactions,
  listSplitTransactions,
  listAcquirers,
  getDefaultFees,
  updateDefaultFees,
  listAllSplitRules,
  reconcileZendryPix,
  refundTransaction,
  chargebackTransaction,
  partialCancelTransaction,
  listSellerWebhookEndpointsAsMaster,
  createSellerWebhookEndpointAsMaster,
  updateSellerWebhookEndpointAsMaster,
  deleteSellerWebhookEndpointAsMaster,
  listPlatformWebhookEndpointsHandler,
  createPlatformWebhookEndpointHandler,
  updatePlatformWebhookEndpointHandler,
  deletePlatformWebhookEndpointHandler,
  requireMasterMiddleware,
} from "../controllers/master.controller";
import { sensitiveActionRateLimit } from "../middleware/authRateLimit";
import { authRateLimit } from "../middleware/authRateLimit";

const router = Router();

/**
 * 🔑 POST /api/master/auth
 * Gera token master a partir do SECRET_TOKEN
 */
router.post("/auth", authRateLimit, generateMasterToken);

/**
 * ✅ POST /api/master/validate
 * Valida se o token tem permissão master
 */
router.post("/validate", validateMasterToken);

/**
 * 📈 GET /api/master/kpas
 * Retorna KPIs do sistema
 * Sem cache (removido em 2026-08-10) — o painel faz polling a cada 5s pra
 * atualizar sozinho sem F5, e um cache de 30s no meio disso fazia esse
 * polling bater em dado velho por até 30s. Tráfego da plataforma ainda é
 * baixo o suficiente pra não precisar de cache aqui.
 */
router.get("/kpas", requireMasterMiddleware, getKpas);

/**
 * 📊 POST /api/master/analytics
 * Receita diária (por status), top sellers e comparação mensal.
 */
router.post("/analytics", getAnalytics);

/**
 * 🏆 GET /api/master/top-products
 * Top 10 produtos mais vendidos — sem cache pelo mesmo motivo do /kpas acima.
 */
router.get("/top-products", requireMasterMiddleware, getMostSaleProducts);

/**
 * 📋 GET /api/master/transactions?limit=&status=
 * Lista as transações mais recentes da plataforma
 */
router.get("/transactions", requireMasterMiddleware, listTransactions);
router.get("/split-transactions", requireMasterMiddleware, listSplitTransactions);

/**
 * 🏦 GET /api/master/acquirers
 * Lista as adquirentes existentes no código, status de configuração e sellers atribuídos
 */
router.get("/acquirers", requireMasterMiddleware, listAcquirers);

/**
 * 💳 GET/PUT /api/master/fees/default
 * Tabela de taxas padrão da plataforma (pix, cartão por bandeira/parcela,
 * liquidação, antecipação) — usada como snapshot em todo seller novo.
 */
router.get("/fees/default", getDefaultFees);
router.put("/fees/default", updateDefaultFees);

/**
 * 🤝 GET /api/master/split-rules
 * Visão de supervisão — todas as parcerias de split da plataforma.
 */
router.get("/split-rules", listAllSplitRules);

/**
 * 🔁 POST /api/master/reconcile-zendry-pix
 * Força a reconciliação de Pix Zendry pendentes há mais de alguns minutos
 * (rede de segurança pro webhook que não chega — ver
 * zendryReconciliation.service.ts). Roda sozinho a cada 10min também.
 */
router.post("/reconcile-zendry-pix", reconcileZendryPix);

/**
 * 💸 POST /api/master/transactions/:id/refund | /chargeback | /partial-cancel
 * Registro MANUAL de reembolso/chargeback/cancelamento parcial — reverte o
 * ledger/wallet da PyxGate e dispara webhook pro seller. Não chama nenhuma
 * API de adquirente (ver services/paymentReversal.service.ts). Rate-limit
 * de ação sensível por ser reversão financeira.
 */
router.post("/transactions/:id/refund", requireMasterMiddleware, sensitiveActionRateLimit, refundTransaction);
router.post("/transactions/:id/chargeback", requireMasterMiddleware, sensitiveActionRateLimit, chargebackTransaction);
router.post(
  "/transactions/:id/partial-cancel",
  requireMasterMiddleware,
  sensitiveActionRateLimit,
  partialCancelTransaction
);

/**
 * 🔔 Webhook do seller — ferramenta de suporte, master vê/edita o webhook
 * de qualquer seller específico (mesma lógica de /developers/webhook-endpoints,
 * só que `:id` vem da URL em vez do JWT do próprio seller).
 */
router.get("/sellers/:id/webhook-endpoints", requireMasterMiddleware, listSellerWebhookEndpointsAsMaster);
router.post("/sellers/:id/webhook-endpoints", requireMasterMiddleware, createSellerWebhookEndpointAsMaster);
router.patch("/sellers/:id/webhook-endpoints/:endpointId", requireMasterMiddleware, updateSellerWebhookEndpointAsMaster);
router.delete("/sellers/:id/webhook-endpoints/:endpointId", requireMasterMiddleware, deleteSellerWebhookEndpointAsMaster);

/**
 * 🌐 Webhooks de PLATAFORMA — próprios do master, eventos platform.* (ver
 * models/webhookEndpoint.model.ts).
 */
router.get("/webhook-endpoints", requireMasterMiddleware, listPlatformWebhookEndpointsHandler);
router.post("/webhook-endpoints", requireMasterMiddleware, createPlatformWebhookEndpointHandler);
router.patch("/webhook-endpoints/:id", requireMasterMiddleware, updatePlatformWebhookEndpointHandler);
router.delete("/webhook-endpoints/:id", requireMasterMiddleware, deletePlatformWebhookEndpointHandler);

export default router;
