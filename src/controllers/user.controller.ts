import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model";

/* --------------------------------------------------------------------------
 🆕 REGISTRO DE USUÁRIO
--------------------------------------------------------------------------- */
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, document, role } = req.body;

    // Validação de campos obrigatórios
    if (!email || !password || !document) {
      res.status(400).json({ 
        status: false, 
        msg: "Email, senha e documento são obrigatórios." 
      });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ status: false, msg: "E-mail já cadastrado." });
      return;
    }

    // Verifica se o documento já existe
    const existingDocument = await User.findOne({ document });
    if (existingDocument) {
      res.status(400).json({ status: false, msg: "CPF/CNPJ já cadastrado." });
      return;
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hash,
      document, // ✅ ADICIONADO
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
  } catch (err: any) {
    console.error("Erro ao registrar usuário:", err);
    res.status(500).json({ status: false, msg: "Erro interno no servidor." });
  }
};

/* --------------------------------------------------------------------------
 🔐 LOGIN DE USUÁRIO
--------------------------------------------------------------------------- */
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ status: false, msg: "Senha incorreta." });
      return;
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "7d" }
    );

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
  } catch (err: any) {
    console.error("Erro no login:", err);
    res.status(500).json({ status: false, msg: "Erro interno no servidor." });
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
      document: document || "00000000000", // Documento padrão para admin se não fornecido
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
  } catch (err: any) {
    console.error("Erro ao criar admin:", err);
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

    const user = await User.findByIdAndUpdate(
      id, 
      { split }, 
      { new: true }
    );
    
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    res.status(200).json({ status: true, msg: "Split fees atualizadas.", user });
  } catch (err: any) {
    console.error("Erro ao atualizar split fees:", err);
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
  } catch (err: any) {
    console.error("Erro ao buscar split fees:", err);
    res.status(500).json({ status: false, msg: "Erro interno no servidor." });
  }
};