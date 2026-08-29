import express from "express";
import multer from "multer";
import path from "path";
import {
  uploadKycDocument,
  listKycDocuments,
  updateKycStatus,
  checkKycStatus,
} from "../controllers/kyc.controller";
import { requireAuth } from "../middleware/requireAuth";

// 🔒 Limite de tamanho + tipo de arquivo (achado de auditoria de segurança
// 2026-08-30) — antes não tinha nenhum dos dois.
const upload = multer({
  dest: path.join(__dirname, "../uploads"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Apenas arquivos JPG, PNG ou PDF são permitidos."));
  },
});
const router = express.Router();

// 🔒 Removido o `express.static` desse diretório (achado de auditoria de
// segurança 2026-08-30): essa pasta é só o rascunho TEMPORÁRIO do multer
// antes do envio pro Cloudinary (ver uploadKycDocument) — servir isso via
// HTTP sem autenticação expunha documento de identidade em texto puro
// enquanto o arquivo esperava ser apagado (e indefinidamente se a limpeza
// falhasse). Não existe motivo legítimo pra esse diretório ser acessível
// por URL.

router.post("/sellers/:sellerId/kyc/upload", requireAuth, upload.single("file"), (req, res) => uploadKycDocument(req, res));
router.get("/sellers/:sellerId/kyc", (req, res) => listKycDocuments(req, res));
router.patch("/sellers/:sellerId/kyc/status", (req, res) => updateKycStatus(req, res));
router.get("/sellers/:sellerId/kyc/check", (req, res) => checkKycStatus(req, res));

export default router;
