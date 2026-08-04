import { Request, Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/user.model";
import { Wallet } from "../models/wallet.model";
import { createToken, decodeToken } from "../config/auth";

type PaymentMethod = "pix" | "creditCard" | "boleto";

/* -------------------------------------------------------
🔐 0. Login do usuário
POST /api/users/login
-------------------------------------------------------- */
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ status: false, msg: "Email e senha são obrigatórios." });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ status: false, msg: "Email ou senha inválidos." });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      res.status(401).json({ status: false, msg: "Email ou senha inválidos." });
      return;
    }

    if (user.status === "suspended") {
      res.status(403).json({ status: false, msg: "Conta suspensa. Contate o suporte." });
      return;
    }

    const token = await createToken({ id: String(user._id), role: user.role });

    res.status(200).json({
      status: true,
      msg: "✅ Login realizado com sucesso.",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    console.error("❌ Erro em loginUser:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao autenticar." });
  }
};

/* -------------------------------------------------------
🆕 1. Registrar novo usuário (seller, client, etc.)
POST /api/users/register
-------------------------------------------------------- */
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, document, role } = req.body;

    if (!name || !email || !password || !document) {
      res.status(400).json({ status: false, msg: "Nome, email, senha e documento (CPF/CNPJ) são obrigatórios." });
      return;
    }

    const existing = await User.findOne({ $or: [{ email }, { document }] });
    if (existing) {
      res.status(409).json({ status: false, msg: "E-mail ou documento já cadastrado." });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 👤 Criar usuário
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      document,
      role: role || "seller",
      status: "active",
      split: {
        cashIn: {
          pix: { fixed: 0, percentage: 0 },
          creditCard: { fixed: 0, percentage: 0 },
          boleto: { fixed: 0, percentage: 0 },
        },
      },
    });

    // 💼 Criar carteira vinculada
    await Wallet.create({
      userId: user._id,
      balance: { available: 0, unAvailable: [] },
      log: [],
    });

    res.status(201).json({
      status: true,
      msg: "✅ Usuário criado com sucesso e carteira vinculada.",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    console.error("❌ Erro em registerUser:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao registrar usuário." });
  }
};

/* -------------------------------------------------------
👑 2. Criar usuário administrador
POST /api/users/admin
-------------------------------------------------------- */
export const createAdminUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ status: false, msg: "Email e senha são obrigatórios." });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ status: false, msg: "Este e-mail já está cadastrado." });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
      status: "active",
      split: {
        cashIn: {
          pix: { fixed: 0, percentage: 0 },
          creditCard: { fixed: 0, percentage: 0 },
          boleto: { fixed: 0, percentage: 0 },
        },
      },
    });

    res.status(201).json({
      status: true,
      msg: "✅ Usuário administrador criado com sucesso.",
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
      },
    });
  } catch (err) {
    console.error("❌ Erro ao criar admin:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao criar admin." });
  }
};

/* -------------------------------------------------------
💸 3. Atualizar taxas de split
PATCH /api/users/:id/split
-------------------------------------------------------- */
export const updateSplitFees = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: userId } = req.params;
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas admins ou master." });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ status: false, msg: "ID de usuário inválido." });
      return;
    }

    const { method, fixed, percentage } = req.body as {
      method: PaymentMethod;
      fixed: number;
      percentage: number;
    };

    const validMethods: PaymentMethod[] = ["pix", "creditCard", "boleto"];
    if (!validMethods.includes(method)) {
      res.status(400).json({ status: false, msg: `Método inválido. Use: ${validMethods.join(", ")}` });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    if (!user.split?.cashIn) {
      user.split = {
        cashIn: {
          pix: { fixed: 0, percentage: 0 },
          creditCard: { fixed: 0, percentage: 0 },
          boleto: { fixed: 0, percentage: 0 },
        },
      };
    }

    const key = method as keyof typeof user.split.cashIn;
    user.split.cashIn[key] = { fixed, percentage };

    await user.save();

    res.status(200).json({
      status: true,
      msg: `✅ Taxas de ${method} atualizadas com sucesso.`,
      split: user.split.cashIn[key],
    });
  } catch (err) {
    console.error("❌ Erro ao atualizar split:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar taxas." });
  }
};

/* -------------------------------------------------------
📊 4. Obter taxas de split de um usuário
GET /api/users/:id/split
-------------------------------------------------------- */
export const getSplitFees = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ status: false, msg: "ID de usuário inválido." });
      return;
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    res.status(200).json({
      status: true,
      msg: "✅ Taxas de split retornadas com sucesso.",
      split: user.split?.cashIn ?? {},
    });
  } catch (err) {
    console.error("❌ Erro ao obter taxas:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao obter taxas." });
  }
};
