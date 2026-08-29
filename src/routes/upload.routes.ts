import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { uploadKycDocument } from "../controllers/upload.controller";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();
// 🔒 Limite de tamanho + tipo de arquivo (achado de auditoria de segurança
// 2026-08-30) — antes não tinha nenhum dos dois.
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Apenas arquivos JPG, PNG ou PDF são permitidos."));
  },
});

const logUploadRoute = (req: Request, _res: Response, next: NextFunction) => {
  console.log("📨 Rota POST /sellers/:id/upload chamada");
  next();
};

router.post(
  "/:id/upload", // ✅ ID diretamente, já que está montado em "/sellers"
  requireAuth,
  upload.single("file"),
  logUploadRoute,
  uploadKycDocument
);

export default router;
