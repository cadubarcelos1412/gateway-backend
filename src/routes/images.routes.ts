import express from "express";
import path from "path";
import { sendFiles, uploadFiles, requireAuthForUpload } from "../controllers/images.controller";

const router = express.Router();

router.use("/files", express.static(path.join(__dirname, "../files")));
// 🔒 requireAuthForUpload roda ANTES do multer (auditoria de segurança
// 2026-08-30) — auth checada antes de qualquer byte do arquivo ser gravado.
router.post("/upload", requireAuthForUpload, uploadFiles, (req, res) => { sendFiles(req, res) });
export default router;
