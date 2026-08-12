import { Request, Response } from "express";
import { Types } from "mongoose";
import { decodeToken } from "../config/auth";
import { User } from "../models/user.model";
import { Seller } from "../models/seller.model";
import { Subaccount } from "../models/subaccount.model";
import { Transaction } from "../models/transaction.model";
import { ACQUIRER_KEYS } from "../acquirers";
import { getOrCreateDefaultFeeConfig } from "../models/systemFeeConfig.model";
import { SplitRule } from "../models/splitRule.model";

/**
 * Agrega vendas/receita (só transações "deposit" aprovadas) por userId —
 * usado tanto na listagem quanto no perfil individual do seller, pra
 * "Vendas"/"Receita" pararem de vir sempre zerado (o campo nunca foi
 * calculado, só existia no tipo do frontend).
 */
async function getSellerStatsByUserId(userIds: Types.ObjectId[]): Promise<Map<string, { totalSales: number; totalRevenue: number }>> {
  const rows = await Transaction.aggregate([
    { $match: { userId: { $in: userIds }, type: "deposit", status: "approved" } },
    { $group: { _id: "$userId", totalSales: { $sum: 1 }, totalRevenue: { $sum: "$amount" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { totalSales: r.totalSales, totalRevenue: r.totalRevenue }]));
}

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

    const defaultFeeConfig = await getOrCreateDefaultFeeConfig();

    const seller = new Seller({
      userId,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone,
      type,
      documentNumber: cleanDoc,
      address,
      kycStatus: "pending",
      // 💳 Snapshot da tabela padrão no momento do cadastro — mudanças futuras no
      // padrão global não alteram sellers já cadastrados (só edição manual altera).
      feeTable: JSON.parse(JSON.stringify(defaultFeeConfig.feeTable)),
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

    const statsByUserId = await getSellerStatsByUserId(sellers.map((s) => s.userId));
    const sellersWithStats = sellers.map((s) => ({
      ...s,
      totalSales: statsByUserId.get(String(s.userId))?.totalSales || 0,
      totalRevenue: statsByUserId.get(String(s.userId))?.totalRevenue || 0,
    }));

    res.status(200).json({
      status: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      sellers: sellersWithStats
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

    const statsByUserId = await getSellerStatsByUserId([seller.userId]);
    const stats = statsByUserId.get(String(seller.userId)) || { totalSales: 0, totalRevenue: 0 };

    const recentTransactions = await Transaction.find({ userId: seller.userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.status(200).json({ status: true, seller: { ...seller, ...stats }, stats, recentTransactions });
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

/* 🔒 Bloquear/desbloquear seller (independente do status de KYC) */
export const toggleSellerStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user || user.role !== "master") {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas master pode alterar o status." });
      return;
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID de seller inválido." });
      return;
    }

    if (!["active", "suspended", "blocked"].includes(status)) {
      res.status(400).json({
        status: false,
        msg: "Status inválido. Use 'active', 'suspended' ou 'blocked'.",
      });
      return;
    }

    const seller = await Seller.findByIdAndUpdate(id, { status }, { new: true }).lean();
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    res.status(200).json({ status: true, msg: `✅ Status atualizado para '${status}'.`, seller });
  } catch (error) {
    console.error("❌ Erro em toggleSellerStatus:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar status." });
  }
};

/**
 * 🤖 Liga/desliga saque PIX automático (sem aprovação manual) de um seller —
 * apenas master. Desligado por padrão pra todo seller novo (ver
 * seller.model.ts); ligar é decisão explícita, seller por seller.
 */
export const toggleAutoWithdraw = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user || user.role !== "master") {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas master pode alterar isso." });
      return;
    }

    const { id } = req.params;
    const { enabled } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID de seller inválido." });
      return;
    }
    if (typeof enabled !== "boolean") {
      res.status(400).json({ status: false, msg: "Campo 'enabled' deve ser true ou false." });
      return;
    }

    const seller = await Seller.findByIdAndUpdate(id, { autoWithdrawEnabled: enabled }, { new: true }).lean();
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    res.status(200).json({
      status: true,
      msg: `✅ Saque automático ${enabled ? "ativado" : "desativado"}.`,
      seller,
    });
  } catch (error) {
    console.error("❌ Erro em toggleAutoWithdraw:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar saque automático." });
  }
};

/* 🏦 Definir qual adquirente processa as transações de um seller – Apenas master */
export const updateSellerAcquirer = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user || user.role !== "master") {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas master pode definir o adquirente." });
      return;
    }

    const { id } = req.params;
    const { acquirer } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID de seller inválido." });
      return;
    }

    if (!ACQUIRER_KEYS.includes(acquirer)) {
      res.status(400).json({
        status: false,
        msg: `Adquirente inválida. Use uma de: ${ACQUIRER_KEYS.join(", ")}.`,
      });
      return;
    }

    const seller = await Seller.findByIdAndUpdate(id, { acquirer }, { new: true }).lean();
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    res.status(200).json({ status: true, msg: `✅ Adquirente definida como '${acquirer}'.`, seller });
  } catch (error) {
    console.error("❌ Erro em updateSellerAcquirer:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar adquirente." });
  }
};

/* 💳 Ver a tabela de taxas efetiva de um seller específico – Apenas master */
export const getSellerFees = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user || user.role !== "master") {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas master pode ver taxas de sellers." });
      return;
    }

    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID de seller inválido." });
      return;
    }

    const seller = await Seller.findById(id).lean();
    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    const feeTable = seller.feeTable ?? (await getOrCreateDefaultFeeConfig()).feeTable;
    res.status(200).json({ status: true, feeTable, isOverride: Boolean(seller.feeTable) });
  } catch (error) {
    console.error("❌ Erro em getSellerFees:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar taxas do seller." });
  }
};

/* 💳 Definir a tabela de taxas individual de um seller – Apenas master */
export const updateSellerFees = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user || user.role !== "master") {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas master pode alterar taxas de sellers." });
      return;
    }

    const { id } = req.params;
    const { feeTable } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID de seller inválido." });
      return;
    }
    if (!feeTable) {
      res.status(400).json({ status: false, msg: "feeTable é obrigatório." });
      return;
    }

    const seller = await Seller.findByIdAndUpdate(
      id,
      { $set: { feeTable } },
      { new: true, runValidators: true }
    ).lean();

    if (!seller) {
      res.status(404).json({ status: false, msg: "Seller não encontrado." });
      return;
    }

    res.status(200).json({ status: true, msg: "✅ Taxas do seller atualizadas.", feeTable: seller.feeTable });
  } catch (error) {
    console.error("❌ Erro em updateSellerFees:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar taxas do seller." });
  }
};

/* 🤝 Listar as regras de split do seller logado (como pagador) */
export const listMySplitRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const seller = await Seller.findOne({ userId: user._id });
    if (!seller) {
      res.status(404).json({ status: false, msg: "Perfil de seller não encontrado." });
      return;
    }

    const rules = await SplitRule.find({ payingSellerId: seller._id }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ status: true, rules });
  } catch (error) {
    console.error("❌ Erro em listMySplitRules:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao listar parcerias." });
  }
};

/* 🤝 Listar as regras de split em que o seller logado é o destinatário —
   parcerias que OUTRO seller criou apontando pra ele. Sem isso, quem é
   convidado nunca vê que está recebendo % de ninguém. */
export const listReceivedSplitRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const seller = await Seller.findOne({ userId: user._id });
    if (!seller) {
      res.status(404).json({ status: false, msg: "Perfil de seller não encontrado." });
      return;
    }

    const rules = await SplitRule.find({ recipientSellerId: seller._id })
      .sort({ createdAt: -1 })
      .populate("payingSellerId", "name email")
      .lean();

    const rulesWithPayer = rules.map((r: any) => ({
      _id: r._id,
      percentage: r.percentage,
      description: r.description,
      status: r.status,
      createdAt: r.createdAt,
      payingSeller: r.payingSellerId
        ? { name: r.payingSellerId.name, email: r.payingSellerId.email }
        : null,
    }));

    res.status(200).json({ status: true, rules: rulesWithPayer });
  } catch (error) {
    console.error("❌ Erro em listReceivedSplitRules:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao listar parcerias recebidas." });
  }
};

/* 🤝 Criar uma regra de split — o destinatário precisa já ser um seller com KYC aprovado */
export const createSplitRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const payingSeller = await Seller.findOne({ userId: user._id });
    if (!payingSeller) {
      res.status(404).json({ status: false, msg: "Perfil de seller não encontrado." });
      return;
    }

    const { recipientEmail, percentage, description } = req.body;

    if (!recipientEmail || !percentage) {
      res.status(400).json({ status: false, msg: "recipientEmail e percentage são obrigatórios." });
      return;
    }
    if (percentage <= 0 || percentage > 100) {
      res.status(400).json({ status: false, msg: "Percentual deve ser maior que 0 e no máximo 100." });
      return;
    }

    const email = String(recipientEmail).trim().toLowerCase();
    const recipientSeller = await Seller.findOne({ email });

    if (!recipientSeller) {
      res.status(400).json({
        status: false,
        msg: "Esse e-mail ainda não tem conta cadastrada na plataforma.",
      });
      return;
    }
    if (recipientSeller.kycStatus !== "approved" && recipientSeller.kycStatus !== "active") {
      res.status(400).json({
        status: false,
        msg: "Esse e-mail tem conta, mas o KYC ainda não foi aprovado. A parceria só pode ser criada depois da aprovação.",
      });
      return;
    }
    if (String(recipientSeller._id) === String(payingSeller._id)) {
      res.status(400).json({ status: false, msg: "Você não pode criar uma parceria com sua própria conta." });
      return;
    }

    const activeRules = await SplitRule.find({ payingSellerId: payingSeller._id, status: "active" });
    const currentTotal = activeRules.reduce((sum, r) => sum + r.percentage, 0);
    if (currentTotal + Number(percentage) > 100) {
      res.status(400).json({
        status: false,
        msg: `A soma das parcerias ativas não pode passar de 100%. Hoje: ${currentTotal}%, disponível: ${round100(100 - currentTotal)}%.`,
      });
      return;
    }

    const rule = await SplitRule.create({
      payingSellerId: payingSeller._id,
      recipientSellerId: recipientSeller._id,
      recipientEmail: email,
      percentage: Number(percentage),
      description: description ? String(description).trim() : undefined,
      status: "active",
      createdBy: user._id,
    });

    res.status(201).json({ status: true, msg: "✅ Parceria criada com sucesso.", rule });
  } catch (error) {
    console.error("❌ Erro em createSplitRule:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao criar parceria." });
  }
};

function round100(n: number): number {
  return Math.round(n * 100) / 100;
}

/* 🤝 Revogar uma regra de split própria */
export const revokeSplitRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserFromToken(req.headers.authorization);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const seller = await Seller.findOne({ userId: user._id });
    if (!seller) {
      res.status(404).json({ status: false, msg: "Perfil de seller não encontrado." });
      return;
    }

    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: false, msg: "ID de parceria inválido." });
      return;
    }

    const rule = await SplitRule.findOneAndUpdate(
      { _id: id, payingSellerId: seller._id },
      { $set: { status: "revoked" } },
      { new: true }
    );

    if (!rule) {
      res.status(404).json({ status: false, msg: "Parceria não encontrada." });
      return;
    }

    res.status(200).json({ status: true, msg: "✅ Parceria revogada.", rule });
  } catch (error) {
    console.error("❌ Erro em revokeSplitRule:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao revogar parceria." });
  }
};
