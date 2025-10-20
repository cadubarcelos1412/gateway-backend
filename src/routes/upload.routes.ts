import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { uploadKycDocument } from "../controllers/upload.controller";

const router = Router();
const upload = multer({ dest: "uploads/" });

const logUploadRoute = (req: Request, _res: Response, next: NextFunction) => {
  console.log("📨 Rota POST /sellers/:id/upload chamada");
  next();
};

router.post(
  "/:id/upload", // ✅ ID diretamente, já que está montado em "/sellers"
  upload.single("file"),
  logUploadRoute,
  uploadKycDocument
);

export default router;
