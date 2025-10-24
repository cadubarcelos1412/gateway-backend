"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkKycStatus = exports.updateKycStatus = exports.listKycDocuments = exports.uploadKycDocument = void 0;
const mongoose_1 = require("mongoose");
const auth_1 = require("../config/auth");
const seller_model_1 = require("../models/seller.model");
const kyc_model_1 = require("../models/kyc.model");
const kycDocument_model_1 = require("../models/kycDocument.model");
const cloudinary_1 = require("../config/cloudinary");
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("fs/promises"));
const REQUIRED_DOCS = {
    PF: ["cnh_frente", "cnh_verso", "selfie", "comprovante_endereco"],
    PJ: ["contrato_social", "cartao_cnpj", "cnh_frente", "cnh_verso", "selfie"],
};
const uploadKycDocument = async (req, res) => {
    try {
        const rawToken = req.headers.authorization?.replace("Bearer ", "");
        if (!rawToken) {
            res.status(401).json({ status: false, msg: "Token ausente." });
            return;
        }
        const payload = await (0, auth_1.decodeToken)(rawToken);
        if (!payload || !payload.id) {
            res.status(401).json({ status: false, msg: "Token inválido." });
            return;
        }
        const sellerId = req.params.sellerId;
        const { docType } = req.body;
        const file = req.file;
        if (!file || !docType) {
            res.status(400).json({ status: false, msg: "Arquivo e docType são obrigatórios." });
            return;
        }
        const seller = await seller_model_1.Seller.findById(sellerId);
        if (!seller) {
            res.status(404).json({ status: false, msg: "Seller não encontrado." });
            return;
        }
        const isOwner = payload.id.toString() === seller.userId.toString();
        const isMaster = payload.role === "master";
        if (!isOwner && !isMaster) {
            res.status(403).json({ status: false, msg: "Acesso negado." });
            return;
        }
        const allowedDocs = REQUIRED_DOCS[seller.type];
        if (!allowedDocs.includes(docType)) {
            res.status(400).json({ status: false, msg: `Documento '${docType}' não permitido.` });
            return;
        }
        const result = await cloudinary_1.cloudinary.uploader.upload(file.path, {
            folder: `kyc/${sellerId}`,
            resource_type: "auto",
            public_id: `${docType}-${Date.now()}`,
        });
        await promises_1.default.unlink(file.path);
        const checksum = crypto_1.default.createHash("sha256").update(result.secure_url).digest("hex");
        await kycDocument_model_1.KycDocument.create({
            sellerId,
            docType,
            url: result.secure_url,
            mimeType: result.resource_type,
            checksum,
            uploadedBy: new mongoose_1.Types.ObjectId(payload.id),
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        });
        const fieldPath = `kycDocuments.${docType}`;
        seller.set(fieldPath, {
            url: result.secure_url,
            uploadedAt: new Date(),
            mimeType: result.resource_type,
            checksum,
        });
        if (seller.kycStatus === "pending") {
            seller.kycStatus = "under_review";
            await kyc_model_1.Kyc.create({ sellerId, status: "under_review" });
        }
        await seller.save();
        res.status(200).json({
            status: true,
            msg: `📁 Documento '${docType}' enviado e salvo com sucesso!`,
            document: { url: result.secure_url, checksum },
        });
    }
    catch (error) {
        console.error("💥 Erro uploadKycDocument:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao processar upload." });
    }
};
exports.uploadKycDocument = uploadKycDocument;
const listKycDocuments = async (req, res) => {
    try {
        const sellerId = req.params.sellerId;
        const seller = await seller_model_1.Seller.findById(sellerId);
        if (!seller) {
            res.status(404).json({ status: false, msg: "Seller não encontrado." });
            return;
        }
        const documents = await kycDocument_model_1.KycDocument.find({ sellerId }).sort({ uploadedAt: -1 });
        res.status(200).json({ status: true, kycStatus: seller.kycStatus, documents });
    }
    catch (error) {
        console.error("💥 Erro listKycDocuments:", error);
        res.status(500).json({ status: false, msg: "Erro ao buscar documentos." });
    }
};
exports.listKycDocuments = listKycDocuments;
const updateKycStatus = async (req, res) => {
    try {
        const rawToken = req.headers.authorization?.replace("Bearer ", "");
        if (!rawToken) {
            res.status(401).json({ status: false, msg: "Token ausente." });
            return;
        }
        const payload = await (0, auth_1.decodeToken)(rawToken);
        if (!payload || payload.role !== "master") {
            res.status(403).json({ status: false, msg: "Acesso negado." });
            return;
        }
        const sellerId = req.params.sellerId;
        const { status, reason } = req.body;
        const validStatuses = ["pending", "under_review", "approved", "rejected", "active"];
        if (!validStatuses.includes(status)) {
            res.status(400).json({ status: false, msg: "Status inválido." });
            return;
        }
        const seller = await seller_model_1.Seller.findById(sellerId);
        if (!seller) {
            res.status(404).json({ status: false, msg: "Seller não encontrado." });
            return;
        }
        const previousStatus = seller.kycStatus;
        seller.kycStatus = status;
        seller.statusHistory.push({
            from: previousStatus,
            to: status,
            changedBy: new mongoose_1.Types.ObjectId(payload.id),
            reason,
            changedAt: new Date(),
        });
        await seller.save();
        await kyc_model_1.Kyc.updateOne({ sellerId }, { status, reviewedAt: new Date(), reviewedBy: new mongoose_1.Types.ObjectId(payload.id), reason });
        res.status(200).json({ status: true, msg: `✅ KYC atualizado para '${status}' com sucesso.` });
    }
    catch (error) {
        console.error("💥 Erro updateKycStatus:", error);
        res.status(500).json({ status: false, msg: "Erro ao atualizar status do KYC." });
    }
};
exports.updateKycStatus = updateKycStatus;
const checkKycStatus = async (req, res) => {
    try {
        const rawToken = req.headers.authorization?.replace("Bearer ", "");
        if (!rawToken) {
            res.status(401).json({ status: false, msg: "Token ausente." });
            return;
        }
        const payload = await (0, auth_1.decodeToken)(rawToken);
        if (!payload || !payload.id) {
            res.status(401).json({ status: false, msg: "Token inválido." });
            return;
        }
        const seller = await seller_model_1.Seller.findOne({ userId: payload.id });
        if (!seller) {
            res.status(404).json({ status: false, msg: "Seller não encontrado." });
            return;
        }
        res.status(200).json({
            status: true,
            kycStatus: seller.kycStatus,
            canOperate: seller.kycStatus === "approved" || seller.kycStatus === "active",
        });
    }
    catch (error) {
        console.error("💥 Erro checkKycStatus:", error);
        res.status(500).json({ status: false, msg: "Erro ao verificar status." });
    }
};
exports.checkKycStatus = checkKycStatus;
