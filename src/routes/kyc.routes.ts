import { Router } from "express";
import {
  getAllKYCs,
  updateKYC,
  uploadKYCDocuments,
  getKYCStats
} from "../controllers/kyc.controller"; // ✅ IMPORTAR DO kyc.controller
import { verifyMasterToken } from "../middleware/MasterAuth";

const router = Router();

/**
 * 🔍 GET /api/kyc/list
 * Lista todos os KYCs (pode ser protegida ou não)
 */
router.get("/list", getAllKYCs);

/**
 * 📊 GET /api/kyc/stats
 * Estatísticas de KYC
 */
router.get("/stats", getKYCStats);

/**
 * ✏️ PUT /api/kyc/update
 * Atualizar status de KYC
 */
router.put("/update", updateKYC);

/**
 * 📤 POST /api/kyc/upload
 * Upload de documentos KYC
 */
router.post("/upload", uploadKYCDocuments);

export default router;