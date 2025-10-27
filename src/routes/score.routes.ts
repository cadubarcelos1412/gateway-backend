import { Router } from "express";
import {
  getSellerScore,
  getTransactionScore,
} from "../controllers/score.controller";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 📊 ROTAS – Score de Risco                                                  */
/* -------------------------------------------------------------------------- */

/**
 * @route GET /api/score/seller/:id
 * @desc Retorna score de risco do seller
 * @access Master/Admin
 */
router.get("/seller/:id", getSellerScore);

/**
 * @route GET /api/score/transaction/:id
 * @desc Retorna score de risco da transação
 * @access Master/Admin
 */
router.get("/transaction/:id", getTransactionScore);

export default router;
