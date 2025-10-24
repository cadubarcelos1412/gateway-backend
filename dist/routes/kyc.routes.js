"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const kyc_controller_1 = require("../controllers/kyc.controller");
const upload = (0, multer_1.default)({ dest: path_1.default.join(__dirname, "../uploads") });
const router = express_1.default.Router();
router.use("/uploads", express_1.default.static(path_1.default.join(__dirname, "../uploads")));
router.post("/sellers/:sellerId/kyc/upload", upload.single("file"), (req, res) => (0, kyc_controller_1.uploadKycDocument)(req, res));
router.get("/sellers/:sellerId/kyc", (req, res) => (0, kyc_controller_1.listKycDocuments)(req, res));
router.patch("/sellers/:sellerId/kyc/status", (req, res) => (0, kyc_controller_1.updateKycStatus)(req, res));
router.get("/sellers/:sellerId/kyc/check", (req, res) => (0, kyc_controller_1.checkKycStatus)(req, res));
exports.default = router;
