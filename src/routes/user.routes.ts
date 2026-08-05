import { Router } from "express";
import {
  loginUser,
  registerUser,
  updateSplitFees,
  createAdminUser,
  getSplitFees,
  verifyEmail,
  resendCode,
  forgotPassword,
  resetPassword,
} from "../controllers/user.controller";

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
router.post("/login", loginUser);

/**
 * 🆕 Registra um novo usuário (seller, cliente, etc.)
 * POST /api/users/register
 * Acesso: Público (controle feito no controller)
 */
router.post("/register", registerUser);

/**
 * 📧 Confirma o e-mail de cadastro com o código recebido
 * POST /api/users/verify-email
 * Acesso: Público
 */
router.post("/verify-email", verifyEmail);

/**
 * 🔁 Reenvia código (cadastro, senha ou PIN)
 * POST /api/users/resend-code
 * Acesso: Público
 */
router.post("/resend-code", resendCode);

/**
 * 🔑 Solicita código de redefinição de senha
 * POST /api/users/forgot-password
 * Acesso: Público
 */
router.post("/forgot-password", forgotPassword);

/**
 * 🔑 Redefine a senha com o código recebido
 * POST /api/users/reset-password
 * Acesso: Público
 */
router.post("/reset-password", resetPassword);

/**
 * 👑 Cria um novo usuário administrador
 * POST /api/users/admin
 * Acesso: Privado (uso interno controlado)
 */
router.post("/admin", createAdminUser);

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
