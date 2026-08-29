import { Router } from "express";
import {
  loginUser,
  verifyLoginCode,
  registerUser,
  updateSplitFees,
  createAdminUser,
  getSplitFees,
  verifyEmail,
  resendCode,
  forgotPassword,
  resetPassword,
} from "../controllers/user.controller";
import { authRateLimit } from "../middleware/authRateLimit";

const router = Router();

/* --------------------------------------------------------------------------
 👤 USERS ROUTES
 Prefixo base: /api/users
--------------------------------------------------------------------------- */

/**
 * 🔐 Login do usuário
 * POST /api/users/login
 * Acesso: Público
 */
// 🔒 authRateLimit em todo endpoint público de autenticação/credencial
// (achado de auditoria de segurança 2026-08-30 — nenhum tinha limite antes).
router.post("/login", authRateLimit, loginUser);

/**
 * 🔐 Confirma o código de verificação de login (2FA) e emite o token
 * POST /api/users/verify-login-code
 * Acesso: Público (só avança quem já provou a senha em /login)
 */
router.post("/verify-login-code", authRateLimit, verifyLoginCode);

/**
 * 🆕 Registra um novo usuário (seller, cliente, etc.)
 * POST /api/users/register
 * Acesso: Público — `role` é sempre "seller" no controller, nunca vem do
 * corpo da requisição (achado de auditoria de segurança 2026-08-30).
 */
router.post("/register", authRateLimit, registerUser);

/**
 * 📧 Confirma o e-mail de cadastro com o código recebido
 * POST /api/users/verify-email
 * Acesso: Público
 */
router.post("/verify-email", authRateLimit, verifyEmail);

/**
 * 🔁 Reenvia código (cadastro, senha ou PIN)
 * POST /api/users/resend-code
 * Acesso: Público
 */
router.post("/resend-code", authRateLimit, resendCode);

/**
 * 🔑 Solicita código de redefinição de senha
 * POST /api/users/forgot-password
 * Acesso: Público
 */
router.post("/forgot-password", authRateLimit, forgotPassword);

/**
 * 🔑 Redefine a senha com o código recebido
 * POST /api/users/reset-password
 * Acesso: Público
 */
router.post("/reset-password", authRateLimit, resetPassword);

/**
 * 👑 Cria um novo usuário administrador
 * POST /api/users/admin
 * Acesso: Apenas master (checagem no controller — achado de auditoria de
 * segurança 2026-08-30, antes não tinha checagem nenhuma).
 */
router.post("/admin", authRateLimit, createAdminUser);

/**
 * 💸 Atualiza as taxas de split para um usuário específico
 * PATCH /api/users/:id/split
 * Acesso: Admin ou Master
 */
router.patch("/:id/split", updateSplitFees);

/**
 * 📊 Retorna as taxas de split configuradas para um usuário
 * GET /api/users/:id/split
 * Acesso: Protegido (necessário token)
 */
router.get("/:id/split", getSplitFees);

/* -------------------------------------------------------------------------- */

export default router;
