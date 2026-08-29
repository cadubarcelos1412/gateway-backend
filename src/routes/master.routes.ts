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
  requireMasterMiddleware,
} from "../controllers/master.controller";
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

export default router;
