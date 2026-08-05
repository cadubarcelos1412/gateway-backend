import { Router } from "express";
import {
  getKpas,
  generateMasterToken,
  validateMasterToken,
  getMostSaleProducts,
  listTransactions,
  listAcquirers,
  getDefaultFees,
  updateDefaultFees,
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
 */
router.get("/kpas", cacheMiddleware(30), getKpas);

/**
 * 🏆 GET /api/master/top-products
 * Top 10 produtos mais vendidos
 */
router.get("/top-products", cacheMiddleware(60), getMostSaleProducts);

/**
 * 📋 GET /api/master/transactions?limit=&status=
 * Lista as transações mais recentes da plataforma
 */
router.get("/transactions", listTransactions);

/**
 * 🏦 GET /api/master/acquirers
 * Lista as adquirentes existentes no código, status de configuração e sellers atribuídos
 */
router.get("/acquirers", listAcquirers);

/**
 * 💳 GET/PUT /api/master/fees/default
 * Tabela de taxas padrão da plataforma (pix, cartão por bandeira/parcela,
 * liquidação, antecipação) — usada como snapshot em todo seller novo.
 */
router.get("/fees/default", getDefaultFees);
router.put("/fees/default", updateDefaultFees);

export default router;
