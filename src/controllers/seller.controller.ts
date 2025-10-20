import { Request, Response } from "express";
import { Types } from "mongoose";
import { decodeToken } from "../config/auth";
import { User } from "../models/user.model";
import { Seller } from "../models/seller.model";
import { Subaccount } from "../models/subaccount.model";

/* 🔑 Utilitário – pegar usuário autenticado pelo token */
const getUserFromToken = async (token?: string) => {
  if (!token) return null;
  const payload = await decodeToken(token.replace("Bearer ", ""));
  if (!payload?.id) return null;
  return await User.findById(payload.id);
};

/* 🆕 Registrar novo Seller + criar subconta automática */
export const registerSeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido ou ausente." });
      return;
    }

    const { name, email, phone, type, documentNumber, address } = req.body;

    if (!name || !email || !type || !documentNumber || !address) {
      res.status(400).json({ status: false, msg: "Campos obrigatórios não preenchidos." });
      return;
    }

    if (!["PF", "PJ"].includes(type)) {
      res.status(400).json({ status: false, msg: "Tipo inválido. Use 'PF' ou 'PJ'." });
      return;
    }

    const cleanDoc: string = String(documentNumber).replace(/\D+/g, "");
    const exists = await Seller.findOne({ documentNumber: cleanDoc }).lean();
    if (exists) {
      res.status(409).json({ status: false, msg: "Já existe um seller cadastrado com este documento." });
      return;
    }

    const userId = new Types.ObjectId(String(user._id));

    const seller = new Seller({
      userId,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone,
      type,
      documentNumber: cleanDoc,
      address,
      kycStatus: "pending",
      statusHistory: [
        {
          from: "pending",
          to: "pending",
          changedBy: userId,
          reason: "Registro inicial",
          changedAt: new Date(),
        },
      ],
    });

    const savedSeller = await seller.save();

    await Subaccount.create({
      sellerId: savedSeller._id as Types.ObjectId,
      balance: { available: 0, retained: 0, total: 0 },
      settlementConfig: { method: "manual", minPayout: 100 },
    });

    res.status(201).json({
      status: true,
      msg: "✅ Seller registrado com sucesso. Aguardando verificação.",
      seller: {
        id: String(savedSeller._id),
        name: savedSeller.name,
        email: savedSeller.email,
        type: savedSeller.type,
        kycStatus: savedSeller.kycStatus,
        createdAt: savedSeller.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ Erro em registerSeller:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao registrar seller." });
  }
};

/* 📜 Listar todos os sellers com filtros e paginação */
export const listSellers = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user || (user.role !== "master" && user.role !== "admin")) {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas admin/master podem listar sellers." });
      return;
    }

    const { status, type, search, dateStart, dateEnd, page = 1, limit = 10 } = req.query;

    const query: any = {};

    if (status) query.kycStatus = status;
    if (type) query.type = type;
    if (dateStart || dateEnd) {
      query.createdAt = {};
      if (dateStart) query.createdAt.$gte = new Date(dateStart as string);
      if (dateEnd) query.createdAt.$lte = new Date(dateEnd as string);
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { documentNumber: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [sellers, total] = await Promise.all([
      Seller.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Seller.countDocuments(query)
    ]);

    res.status(200).json({
      status: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      sellers
    });
  } catch (error) {
    console.error("❌ Erro em listSellers:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao listar sellers." });
  }
};

/* 👤 Ver perfil do seller logado */
export const getMySellerProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido ou ausente." });
      return;
    }

    const seller = await Seller.findOne({ userId: user._id }).lean();
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    if (user.role !== "master") {
      const { kycDocuments, ...rest } = seller;
      res.status(200).json({ status: true, seller: rest });
      return;
    }

    res.status(200).json({ status: true, seller });
  } catch (error) {
    console.error("❌ Erro em getMySellerProfile:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar perfil do seller." });
  }
};

/* 🛡️ Ver perfil completo por ID – apenas master */
export const getSellerById = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user || user.role !== "master") {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas master pode visualizar sellers." });
      return;
    }

    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID inválido." });
      return;
    }

    const seller = await Seller.findById(id).lean();
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    res.status(200).json({ status: true, seller });
  } catch (error) {
    console.error("❌ Erro em getSellerById:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar seller." });
  }
};

/* 🪪 Atualizar status de verificação (KYC) – Apenas master */
export const verifySellerKYC = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user || user.role !== "master") {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas master pode atualizar KYC." });
      return;
    }

    const { id } = req.params;
    const { status, reason } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID de seller inválido." });
      return;
    }

    if (!["under_review", "approved", "rejected"].includes(status)) {
      res.status(400).json({
        status: false,
        msg: "Status inválido. Use 'under_review', 'approved' ou 'rejected'.",
      });
      return;
    }

    const seller = await Seller.findById(id);
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    seller.statusHistory.push({
      from: seller.kycStatus,
      to: status,
      changedBy: new Types.ObjectId(String(user._id)),
      reason: reason || "Status atualizado manualmente",
      changedAt: new Date(),
    });

    seller.kycStatus = status;
    await seller.save();

    res.status(200).json({
      status: true,
      msg: `✅ KYC atualizado para '${status}' com sucesso.`,
      seller: {
        id: seller._id,
        name: seller.name,
        email: seller.email,
        kycStatus: seller.kycStatus,
        updatedAt: seller.updatedAt,
      },
    });
  } catch (error) {
    console.error("❌ Erro em verifySellerKYC:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar status de KYC." });
  }
};
