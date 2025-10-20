import express from "express";
import multer from "multer";
import path from "path";
import {
  uploadKycDocument,
  listKycDocuments,
  updateKycStatus,
  checkKycStatus,
} from "../controllers/kyc.controller";

const upload = multer({ dest: path.join(__dirname, "../uploads") });
const router = express.Router();

router.use("/uploads", express.static(path.join(__dirname, "../uploads")));

router.post("/sellers/:sellerId/kyc/upload", upload.single("file"), (req, res) => uploadKycDocument(req, res));
router.get("/sellers/:sellerId/kyc", (req, res) => listKycDocuments(req, res));
router.patch("/sellers/:sellerId/kyc/status", (req, res) => updateKycStatus(req, res));
router.get("/sellers/:sellerId/kyc/check", (req, res) => checkKycStatus(req, res));

export default router;
