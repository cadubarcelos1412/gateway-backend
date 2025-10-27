import { Router } from "express";
import {
  getSuspiciousTransactions,
  reviewSuspiciousTransaction,
} from "../controllers/suspicious.controller";

const router = Router();

/* 🚨 Transações suspeitas */
router.get("/", getSuspiciousTransactions);
router.post("/review", reviewSuspiciousTransaction);

export default router;
