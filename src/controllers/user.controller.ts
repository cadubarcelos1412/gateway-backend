import { Request, Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/user.model";
import { Wallet } from "../models/wallet.model";
import { createToken, decodeToken } from "../config/auth";
import { createVerificationCode, verifyCode } from "../services/verificationCode.service";
import { sendVerificationCodeEmail } from "../services/email.service";
import { VerificationPurpose } from "../models/verificationCode.model";

type PaymentMethod = "pix" | "creditCard" | "boleto";

/* -------------------------------------------------------
🔐 0. Login do usuário
POST /api/users/login
-------------------------------------------------------- */
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, rememberMe } = req.body;

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

    if (user.status === "pending") {
      res.status(403).json({
        status: false,
        msg: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada ou peça um novo código.",
        code: "EMAIL_NOT_VERIFIED",
      });
      return;
    }

    // 🚧 2FA em standby (decisão de negócio, 2026-08-10): implementação
    // pronta e testada abaixo, mas desligada por padrão — precisamos testar
    // login em contas de clientes reais (sellers) sem depender de pedir o
    // código de e-mail toda vez pra eles. Sem LOGIN_2FA_ENABLED=true na env,
    // login volta a emitir token direto, como antes do 2FA existir. O
    // frontend já trata os dois casos (LoginPage.tsx e RegisterPage.tsx
    // checam `twoFactorRequired` antes de decidir o que fazer) — pra
    // reativar: só setar a env var no Render, nenhum código muda.
    if (process.env.LOGIN_2FA_ENABLED !== "true") {
      const token = await createToken({ id: String(user._id), role: user.role }, Boolean(rememberMe));
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
      return;
    }

    // 🔐 Segundo fator obrigatório: senha correta só destrava o envio do
    // código por e-mail — o token só sai depois em verifyLoginCode. Falha no
    // envio bloqueia o login (fail-closed): não dá pra pular o 2FA.
    let code: string | null = null;
    try {
      code = await createVerificationCode(user._id as mongoose.Types.ObjectId, "login_2fa");
    } catch (err: any) {
      // Cooldown de reenvio: já existe um código válido enviado há pouco
      // (ex.: usuário deu F5 na tela de login); não é uma falha real.
      if (!/^Aguarde/.test(err?.message || "")) {
        console.error("❌ Falha ao gerar código de verificação de login:", err);
        res.status(500).json({
          status: false,
          msg: "Não foi possível enviar o código de verificação agora. Tente novamente.",
        });
        return;
      }
    }

    if (code) {
      try {
        await sendVerificationCodeEmail(user.email, code, "login_2fa");
      } catch (err) {
        console.error("❌ Falha ao enviar e-mail de verificação de login:", err);
        res.status(500).json({
          status: false,
          msg: "Não foi possível enviar o código de verificação agora. Tente novamente.",
        });
        return;
      }
    }

    res.status(200).json({
      status: true,
      msg: "Enviamos um código de verificação pro seu e-mail.",
      twoFactorRequired: true,
      email: user.email,
    });
  } catch (err) {
    console.error("❌ Erro em loginUser:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao autenticar." });
  }
};

/* -------------------------------------------------------
🔐 0️⃣b Confirma o código 2FA de login e emite o token
POST /api/users/verify-login-code
-------------------------------------------------------- */
export const verifyLoginCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code, rememberMe } = req.body;
    if (!email || !code) {
      res.status(400).json({ status: false, msg: "Email e código são obrigatórios." });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ status: false, msg: "Código inválido ou expirado." });
      return;
    }

    const ok = await verifyCode(user._id as mongoose.Types.ObjectId, "login_2fa", code);
    if (!ok) {
      res.status(400).json({ status: false, msg: "Código inválido ou expirado." });
      return;
    }

    const token = await createToken({ id: String(user._id), role: user.role }, Boolean(rememberMe));

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
    console.error("❌ Erro em verifyLoginCode:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao verificar código." });
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

    // 👤 Criar usuário — status "pending" até confirmar o e-mail.
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      document,
      role: role || "seller",
      status: "pending",
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

    // 📧 Código de confirmação de cadastro — falha no envio não desfaz o
    // cadastro (usuário já criado), mas é reportada pra ele poder pedir
    // reenvio depois.
    try {
      const code = await createVerificationCode(user._id as mongoose.Types.ObjectId, "signup");
      await sendVerificationCodeEmail(user.email, code, "signup");
    } catch (emailErr) {
      console.error("⚠️ Falha ao enviar código de confirmação de cadastro:", emailErr);
    }

    res.status(201).json({
      status: true,
      msg: "✅ Usuário criado. Enviamos um código de confirmação pro seu e-mail.",
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
📧 1️⃣b Confirmar e-mail de cadastro
POST /api/users/verify-email
-------------------------------------------------------- */
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      res.status(400).json({ status: false, msg: "Email e código são obrigatórios." });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    if (user.status !== "pending") {
      res.status(400).json({ status: false, msg: "Este e-mail já está confirmado." });
      return;
    }

    const ok = await verifyCode(user._id as mongoose.Types.ObjectId, "signup", code);
    if (!ok) {
      res.status(400).json({ status: false, msg: "Código inválido ou expirado." });
      return;
    }

    user.status = "active";
    await user.save();

    res.status(200).json({ status: true, msg: "✅ E-mail confirmado com sucesso. Você já pode entrar." });
  } catch (err) {
    console.error("❌ Erro em verifyEmail:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao confirmar e-mail." });
  }
};

/* -------------------------------------------------------
🔁 1️⃣c Reenviar código (cadastro, senha ou PIN)
POST /api/users/resend-code
-------------------------------------------------------- */
export const resendCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, purpose } = req.body as { email?: string; purpose?: VerificationPurpose };
    const validPurposes: VerificationPurpose[] = ["signup", "password_reset", "pin_reset", "login_2fa"];

    if (!email || !purpose || !validPurposes.includes(purpose)) {
      res.status(400).json({
        status: false,
        msg: "Email e purpose (signup|password_reset|pin_reset|login_2fa) são obrigatórios.",
      });
      return;
    }

    const user = await User.findOne({ email });
    // Resposta genérica mesmo se o usuário não existir — evita confirmar
    // pra quem está tentando descobrir e-mails cadastrados.
    if (!user) {
      res.status(200).json({ status: true, msg: "Se o e-mail existir, um novo código foi enviado." });
      return;
    }

    try {
      const code = await createVerificationCode(user._id as mongoose.Types.ObjectId, purpose);
      await sendVerificationCodeEmail(user.email, code, purpose);
    } catch (err: any) {
      // Cooldown de reenvio é um erro esperado — repassa a mensagem específica.
      res.status(429).json({ status: false, msg: err?.message || "Não foi possível reenviar o código agora." });
      return;
    }

    res.status(200).json({ status: true, msg: "Se o e-mail existir, um novo código foi enviado." });
  } catch (err) {
    console.error("❌ Erro em resendCode:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao reenviar código." });
  }
};

/* -------------------------------------------------------
🔑 1️⃣d Esqueci minha senha
POST /api/users/forgot-password
-------------------------------------------------------- */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ status: false, msg: "Email é obrigatório." });
      return;
    }

    const user = await User.findOne({ email });
    if (user) {
      try {
        const code = await createVerificationCode(user._id as mongoose.Types.ObjectId, "password_reset");
        await sendVerificationCodeEmail(user.email, code, "password_reset");
      } catch (err) {
        console.error("⚠️ Falha ao enviar código de redefinição de senha:", err);
      }
    }

    // Sempre genérico — não revela se o e-mail existe.
    res.status(200).json({ status: true, msg: "Se o e-mail existir, enviamos um código de redefinição." });
  } catch (err) {
    console.error("❌ Erro em forgotPassword:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao processar solicitação." });
  }
};

/* -------------------------------------------------------
🔑 1️⃣e Redefinir senha com código
POST /api/users/reset-password
-------------------------------------------------------- */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      res.status(400).json({ status: false, msg: "Email, código e nova senha são obrigatórios." });
      return;
    }
    if (String(newPassword).length < 6) {
      res.status(400).json({ status: false, msg: "A nova senha deve ter pelo menos 6 caracteres." });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ status: false, msg: "Código inválido ou expirado." });
      return;
    }

    const ok = await verifyCode(user._id as mongoose.Types.ObjectId, "password_reset", code);
    if (!ok) {
      res.status(400).json({ status: false, msg: "Código inválido ou expirado." });
      return;
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({ status: true, msg: "✅ Senha redefinida com sucesso." });
  } catch (err) {
    console.error("❌ Erro em resetPassword:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao redefinir senha." });
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
