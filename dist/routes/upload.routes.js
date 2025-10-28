"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const upload_controller_1 = require("../controllers/upload.controller");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ dest: "uploads/" });
const logUploadRoute = (req, _res, next) => {
    console.log("📨 Rota POST /sellers/:id/upload chamada");
    next();
};
router.post("/:id/upload", // ✅ ID diretamente, já que está montado em "/sellers"
upload.single("file"), logUploadRoute, upload_controller_1.uploadKycDocument);
exports.default = router;
