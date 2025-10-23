import { Router, Request, Response } from "express";
import {
  registerUser,
  updateSplitFees,
  createAdminUser,
  getSplitFees,
  loginUser,
} from "../controllers/user.controller";

const router = Router();

/* --------------------------------------------------------------------------
 👤 USERS ROUTES
 Prefixo base: /api/users
--------------------------------------------------------------------------- */

/**
 * 🆕 Registra um novo usuário
 */
router.post("/register", (req: Request, res: Response) => {
  registerUser(req, res);
});

/**
 * 🔐 Login de usuário
 */
router.post("/login", (req: Request, res: Response) => {
  loginUser(req, res);
});

/**
 * 👑 Cria novo admin
 */
router.post("/admin", (req: Request, res: Response) => {
  createAdminUser(req, res);
});

/**
 * 💸 Atualiza split fees
 */
router.patch("/:id/split", (req: Request, res: Response) => {
  updateSplitFees(req, res);
});

/**
 * 📊 Retorna split fees
 */
router.get("/:id/split", (req: Request, res: Response) => {
  getSplitFees(req, res);
});

/* -------------------------------------------------------------------------- */

export default router;
