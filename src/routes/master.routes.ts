import { Router } from "express";
import {
  getKpas,
  generateMasterToken,
  validateMasterToken,
  getMostSaleProducts,
  getAllUsers,
  getAllTransactions,
  getLastTransactions,
  updateUser,
  approveWithdrawal,
  declineWithdrawal,
} from "../controllers/master.controller";
import { cacheMiddleware } from "../middleware/cache";
import { verifyMasterToken } from "../middleware/MasterAuth";

const router = Router();

// ============================================
// 🔓 ROTAS PÚBLICAS (SEM AUTENTICAÇÃO)
// ============================================

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

// ============================================
// 🔐 ROTAS PROTEGIDAS (REQUEREM TOKEN MASTER)
// ============================================

/**
 * 📈 POST /api/master/kpas
 * Retorna KPIs do sistema
 */
router.post("/kpas", verifyMasterToken, cacheMiddleware(30), getKpas);

/**
 * 🏆 GET /api/master/top
 * Top 10 produtos mais vendidos
 */
router.get("/top", verifyMasterToken, cacheMiddleware(60), getMostSaleProducts);

/**
 * 👥 GET /api/master/users
 * Lista todos os usuários
 */
router.get("/users", verifyMasterToken, getAllUsers);

/**
 * 💳 POST /api/master/transactions
 * Lista todas as transações
 */
router.post("/transactions", verifyMasterToken, getAllTransactions);

/**
 * 📜 POST /api/master/last-transactions
 * Últimas 10 transações
 */
router.post("/last-transactions", verifyMasterToken, getLastTransactions);

/**
 * ✏️ POST /api/master/user/update
 * Atualiza dados de um usuário
 */
router.post("/user/update", verifyMasterToken, updateUser);

/**
 * ✅ POST /api/master/withdrawal/accept
 * Aprova um saque pendente
 */
router.post("/withdrawal/accept", verifyMasterToken, approveWithdrawal);

/**
 * ❌ POST /api/master/withdrawal/decline
 * Rejeita um saque pendente
 */
router.post("/withdrawal/decline", verifyMasterToken, declineWithdrawal);

export default router;