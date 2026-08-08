import { Router } from "express";
import {
  getKpas,
  getAnalytics,
  generateMasterToken,
  validateMasterToken,
  getMostSaleProducts,
  listTransactions,
  listAcquirers,
  getDefaultFees,
  updateDefaultFees,
  listAllSplitRules,
  reconcileZendryPix,
  requireMasterMiddleware,
} from "../controllers/master.controller";
import { cacheMiddleware } from "../middleware/cache";

const router = Router();

/**
 * 🔑 POST /api/master/auth
 * Gera token master a partir do SECRET_TOKEN
 */
router.post("/auth", generateMasterToken);

/**
 * ✅ POST /api/master/validate
 * Valida se o token tem permissão master
 */
router.post("/validate", validateMasterToken);

/**
 * 📈 GET /api/master/kpas
 * Retorna KPIs do sistema
 * ⚠️ Auth ANTES do cache: cacheMiddleware serve por URL sem checar nada, se
 * a auth só existisse dentro do controller uma requisição sem token nenhum
 * ainda receberia dados de um cache já aquecido por outra requisição.
 */
router.get("/kpas", requireMasterMiddleware, cacheMiddleware(30), getKpas);

/**
 * 📊 POST /api/master/analytics
 * Receita diária (por status), top sellers e comparação mensal.
 */
router.post("/analytics", getAnalytics);

/**
 * 🏆 GET /api/master/top-products
 * Top 10 produtos mais vendidos
 */
router.get("/top-products", requireMasterMiddleware, cacheMiddleware(60), getMostSaleProducts);

/**
 * 📋 GET /api/master/transactions?limit=&status=
 * Lista as transações mais recentes da plataforma
 */
router.get("/transactions", requireMasterMiddleware, listTransactions);

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
