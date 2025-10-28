import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { User } from "../models/user.model";
import { createToken } from "../config/auth";

/* --------------------------------------------------------------------------
 🆕 REGISTRO DE USUÁRIO
--------------------------------------------------------------------------- */
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, document, role } = req.body;

    if (!email || !password || !document) {
      res.status(400).json({
        status: false,
        msg: "Email, senha e documento são obrigatórios.",
      });
      return;
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      res.status(400).json({ status: false, msg: "E-mail já cadastrado." });
      return;
    }

    const existingDocument = await User.findOne({ document });
    if (existingDocument) {
      res.status(400).json({ status: false, msg: "CPF/CNPJ já cadastrado." });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      document,
      role: role || "seller",
      status: "active",
      createdAt: new Date(),
    });

    res.status(201).json({
      status: true,
      msg: "Usuário registrado com sucesso.",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("❌ Erro ao registrar usuário:", error);
    res.status(500).json({ status: false, msg: "Erro interno no servidor." });
  }
};

/* --------------------------------------------------------------------------
 🔐 LOGIN DE USUÁRIO (PADRÃO UNIFICADO)
--------------------------------------------------------------------------- */
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    if (user.status !== "active") {
      res.status(403).json({ status: false, msg: "Conta inativa ou bloqueada." });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ status: false, msg: "Senha incorreta." });
      return;
    }

    // 👇 Corrigido o erro de tipagem do _id (TypeScript reconhece como unknown)
    const userId = (user._id as unknown as string).toString();

    const token = await createToken({
      id: userId,
      role: user.role as "seller" | "admin" | "master",
    });

    res.status(200).json({
      status: true,
      msg: "Login realizado com sucesso.",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("❌ Erro no login:", error);
    res.status(500).json({
      status: false,
      msg: "Erro interno no servidor. Tente novamente mais tarde.",
    });
  }
};

/* --------------------------------------------------------------------------
 👑 CRIAÇÃO DE ADMIN
--------------------------------------------------------------------------- */
export const createAdminUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, document } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ status: false, msg: "Admin já cadastrado." });
      return;
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hash,
      document: document || "00000000000",
      role: "admin",
      status: "active",
      createdAt: new Date(),
    });

    res.status(201).json({
      status: true,
      msg: "Administrador criado com sucesso.",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("❌ Erro ao criar admin:", error);
    res.status(500).json({ status: false, msg: "Erro interno no servidor." });
  }
};

/* --------------------------------------------------------------------------
 💸 ATUALIZAÇÃO DE SPLIT FEES
--------------------------------------------------------------------------- */
export const updateSplitFees = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { split } = req.body;

    const user = await User.findByIdAndUpdate(id, { split }, { new: true });
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    res.status(200).json({ status: true, msg: "Split fees atualizadas.", user });
  } catch (error) {
    console.error("❌ Erro ao atualizar split fees:", error);
    res.status(500).json({ status: false, msg: "Erro interno no servidor." });
  }
};

/* --------------------------------------------------------------------------
 📊 OBTÉM SPLIT FEES
--------------------------------------------------------------------------- */
export const getSplitFees = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).lean();

    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    const split = (user as any).split || null;
    res.status(200).json({ status: true, split });
  } catch (error) {
    console.error("❌ Erro ao buscar split fees:", error);
    res.status(500).json({ status: false, msg: "Erro interno no servidor." });
  }
};
