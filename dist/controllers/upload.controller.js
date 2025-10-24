"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadKycDocument = void 0;
const cloudinary_1 = require("../config/cloudinary");
const auth_1 = require("../config/auth");
const seller_model_1 = require("../models/seller.model");
const promises_1 = __importDefault(require("fs/promises"));
const REQUIRED_DOCS = {
    PF: ["cnh_frente", "cnh_verso", "selfie", "comprovante_endereco"],
    PJ: ["contrato_social", "cartao_cnpj", "cnh_frente", "cnh_verso", "selfie"],
};
const uploadKycDocument = async (req, res) => {
    console.log("📥 Iniciando upload de documento KYC...");
    try {
        // 🔐 1. Autenticação via token
        const rawToken = req.headers.authorization?.replace("Bearer ", "");
        if (!rawToken) {
            res.status(401).json({ status: false, msg: "Token ausente." });
            return;
        }
        let payload;
        try {
            payload = await (0, auth_1.decodeToken)(rawToken);
            console.log("👤 Token decodificado:", payload);
        }
        catch (err) {
            console.error("❌ Erro ao decodificar token:", err);
            res.status(401).json({ status: false, msg: "Token inválido." });
            return;
        }
        // 🧾 2. Extração dos dados da requisição
        const sellerId = req.params.id;
        const file = req.file;
        const { docType } = req.body;
        if (!file) {
            res.status(400).json({ status: false, msg: "Nenhum arquivo foi enviado." });
            return;
        }
        if (!docType || typeof docType !== "string") {
            res.status(400).json({ status: false, msg: "Campo 'docType' é obrigatório e deve ser uma string." });
            return;
        }
        console.log("📄 docType:", docType);
        console.log("📎 Arquivo recebido:", file.originalname);
        // 📂 3. Verifica se o arquivo existe no sistema (safety check do multer)
        try {
            await promises_1.default.access(file.path);
        }
        catch {
            res.status(500).json({ status: false, msg: "Arquivo enviado não foi salvo corretamente." });
            return;
        }
        // 🧠 4. Validação de seller
        const seller = await seller_model_1.Seller.findById(sellerId);
        if (!seller) {
            res.status(404).json({ status: false, msg: "Seller não encontrado." });
            return;
        }
        // 🔒 5. Verifica permissão de acesso
        const isOwner = payload.id === seller.userId.toString();
        const isMaster = payload.role === "master";
        if (!isOwner && !isMaster) {
            res.status(403).json({ status: false, msg: "Acesso negado. Você não tem permissão para este seller." });
            return;
        }
        // 📑 6. Verifica se o docType é permitido para o tipo do seller
        const allowedDocs = REQUIRED_DOCS[seller.type];
        if (!allowedDocs || !allowedDocs.includes(docType)) {
            res.status(400).json({
                status: false,
                msg: `Documento '${docType}' não é permitido para sellers do tipo '${seller.type}'.`,
            });
            return;
        }
        // ☁️ 7. Upload para Cloudinary
        let result;
        try {
            console.log("☁️ Enviando para Cloudinary...");
            result = await cloudinary_1.cloudinary.uploader.upload(file.path, {
                folder: `kyc/${sellerId}`,
                resource_type: "auto",
                public_id: `${docType}-${Date.now()}`,
            });
            console.log("✅ Upload concluído. URL:", result.secure_url);
        }
        catch (err) {
            console.error("❌ Falha ao enviar arquivo para o Cloudinary:", err);
            res.status(500).json({ status: false, msg: "Erro ao enviar o documento para o serviço de armazenamento." });
            return;
        }
        // 🧹 8. Remove o arquivo temporário local
        try {
            await promises_1.default.unlink(file.path);
            console.log("🧹 Arquivo temporário removido:", file.path);
        }
        catch (cleanupErr) {
            console.warn("⚠️ Falha ao remover arquivo temporário:", cleanupErr);
        }
        // 💾 9. Salva referência no MongoDB
        const fieldPath = `kycDocuments.${docType}`;
        seller.set(fieldPath, {
            url: result.secure_url,
            uploadedAt: new Date(),
            mimeType: result.resource_type,
            checksum: result.asset_id,
        });
        await seller.save();
        // 📤 10. Resposta final de sucesso
        res.status(200).json({
            status: true,
            msg: `📁 Documento '${docType}' enviado e salvo com sucesso!`,
            document: {
                url: result.secure_url,
                type: result.resource_type,
                field: fieldPath,
            },
        });
    }
    catch (error) {
        console.error("💥 Erro inesperado no controller uploadKycDocument:", error);
        res.status(500).json({
            status: false,
            msg: "Erro interno inesperado ao processar o envio do documento.",
            error: error.message,
        });
    }
};
exports.uploadKycDocument = uploadKycDocument;
