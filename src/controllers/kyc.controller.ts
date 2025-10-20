import { Request, Response } from "express";
import { Types } from "mongoose";
import { decodeToken } from "../config/auth";
import { Seller } from "../models/seller.model";
import { Kyc } from "../models/kyc.model";
import { KycDocument } from "../models/kycDocument.model";
import { cloudinary } from "../config/cloudinary";
import crypto from "crypto";
import fs from "fs/promises";

const REQUIRED_DOCS = {
  PF: ["cnh_frente", "cnh_verso", "selfie", "comprovante_endereco"],
  PJ: ["contrato_social", "cartao_cnpj", "cnh_frente", "cnh_verso", "selfie"],
};

export const uploadKycDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = req.headers.authorization?.replace("Bearer ", "");
    if (!rawToken) {
      res.status(401).json({ status: false, msg: "Token ausente." });
      return;
    }

    const payload = await decodeToken(rawToken);
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

    const seller = await Seller.findById(sellerId);
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

    const allowedDocs = REQUIRED_DOCS[seller.type as "PF" | "PJ"];
    if (!allowedDocs.includes(docType)) {
      res.status(400).json({ status: false, msg: `Documento '${docType}' não permitido.` });
      return;
    }

    const result = await cloudinary.uploader.upload(file.path, {
      folder: `kyc/${sellerId}`,
      resource_type: "auto",
      public_id: `${docType}-${Date.now()}`,
    });

    await fs.unlink(file.path);

    const checksum = crypto.createHash("sha256").update(result.secure_url).digest("hex");

    await KycDocument.create({
      sellerId,
      docType,
      url: result.secure_url,
      mimeType: result.resource_type,
      checksum,
      uploadedBy: new Types.ObjectId(payload.id),
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
      await Kyc.create({ sellerId, status: "under_review" });
    }

    await seller.save();

    res.status(200).json({
      status: true,
      msg: `📁 Documento '${docType}' enviado e salvo com sucesso!`,
      document: { url: result.secure_url, checksum },
    });
  } catch (error) {
    console.error("💥 Erro uploadKycDocument:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao processar upload." });
  }
};

export const listKycDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const sellerId = req.params.sellerId;
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    const documents = await KycDocument.find({ sellerId }).sort({ uploadedAt: -1 });
    res.status(200).json({ status: true, kycStatus: seller.kycStatus, documents });
  } catch (error) {
    console.error("💥 Erro listKycDocuments:", error);
    res.status(500).json({ status: false, msg: "Erro ao buscar documentos." });
  }
};

export const updateKycStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = req.headers.authorization?.replace("Bearer ", "");
    if (!rawToken) {
      res.status(401).json({ status: false, msg: "Token ausente." });
      return;
    }

    const payload = await decodeToken(rawToken);
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

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    const previousStatus = seller.kycStatus;
    seller.kycStatus = status;
    seller.statusHistory.push({
      from: previousStatus,
      to: status,
      changedBy: new Types.ObjectId(payload.id),
      reason,
      changedAt: new Date(),
    });

    await seller.save();
    await Kyc.updateOne(
      { sellerId },
      { status, reviewedAt: new Date(), reviewedBy: new Types.ObjectId(payload.id), reason }
    );

    res.status(200).json({ status: true, msg: `✅ KYC atualizado para '${status}' com sucesso.` });
  } catch (error) {
    console.error("💥 Erro updateKycStatus:", error);
    res.status(500).json({ status: false, msg: "Erro ao atualizar status do KYC." });
  }
};

export const checkKycStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = req.headers.authorization?.replace("Bearer ", "");
    if (!rawToken) {
      res.status(401).json({ status: false, msg: "Token ausente." });
      return;
    }

    const payload = await decodeToken(rawToken);
    if (!payload || !payload.id) {
      res.status(401).json({ status: false, msg: "Token inválido." });
      return;
    }

    const seller = await Seller.findOne({ userId: payload.id });
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    res.status(200).json({
      status: true,
      kycStatus: seller.kycStatus,
      canOperate: seller.kycStatus === "approved" || seller.kycStatus === "active",
    });
  } catch (error) {
    console.error("💥 Erro checkKycStatus:", error);
    res.status(500).json({ status: false, msg: "Erro ao verificar status." });
  }
};
