import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { User } from "../models/user.model";
import { decodeToken } from "../config/auth";
import { createVerificationCode, verifyCode } from "../services/verificationCode.service";
import { sendVerificationCodeEmail } from "../services/email.service";

const PIN_REGEX = /^\d{4}$/;

async function getAuthenticatedUser(req: Request) {
  const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
  const payload = await decodeToken(token);
  if (!payload?.id) return null;
  return User.findById(payload.id);
}

/* -------------------------------------------------------
🔐 1️⃣ Configurar o PIN de saque pela primeira vez
POST /api/user/pin/setup
-------------------------------------------------------- */
export const setupPin = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    if (user.withdrawalPin?.hash) {
      res.status(400).json({ status: false, msg: "Você já tem um PIN configurado. Use trocar PIN." });
      return;
    }

    const { pin, confirmPin } = req.body;
    if (!pin || !PIN_REGEX.test(pin)) {
      res.status(400).json({ status: false, msg: "PIN deve ter exatamente 4 dígitos numéricos." });
      return;
    }
    if (pin !== confirmPin) {
      res.status(400).json({ status: false, msg: "A confirmação não bate com o PIN informado." });
      return;
    }

    user.withdrawalPin = { hash: await bcrypt.hash(pin, 10), setAt: new Date() };
    await user.save();

    res.status(201).json({ status: true, msg: "✅ PIN de saque configurado com sucesso." });
  } catch (err) {
    console.error("❌ Erro em setupPin:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao configurar PIN." });
  }
};

/* -------------------------------------------------------
🔐 2️⃣ Trocar o PIN de saque (exige o atual)
POST /api/user/pin/change
-------------------------------------------------------- */
export const changePin = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    if (!user.withdrawalPin?.hash) {
      res.status(400).json({ status: false, msg: "Você ainda não tem um PIN configurado." });
      return;
    }

    const { currentPin, newPin, confirmNewPin } = req.body;
    if (!currentPin || !newPin || !confirmNewPin) {
      res.status(400).json({ status: false, msg: "PIN atual, novo PIN e confirmação são obrigatórios." });
      return;
    }

    const currentMatches = await bcrypt.compare(currentPin, user.withdrawalPin.hash);
    if (!currentMatches) {
      res.status(401).json({ status: false, msg: "PIN atual incorreto." });
      return;
    }

    if (!PIN_REGEX.test(newPin)) {
      res.status(400).json({ status: false, msg: "Novo PIN deve ter exatamente 4 dígitos numéricos." });
      return;
    }
    if (newPin !== confirmNewPin) {
      res.status(400).json({ status: false, msg: "A confirmação não bate com o novo PIN." });
      return;
    }

    user.withdrawalPin = { hash: await bcrypt.hash(newPin, 10), setAt: new Date() };
    await user.save();

    res.status(200).json({ status: true, msg: "✅ PIN de saque atualizado com sucesso." });
  } catch (err) {
    console.error("❌ Erro em changePin:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao trocar PIN." });
  }
};

/* -------------------------------------------------------
🔐 3️⃣ Esqueci meu PIN — envia código pro próprio e-mail
POST /api/user/pin/forgot
-------------------------------------------------------- */
export const forgotPin = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const code = await createVerificationCode(user._id as Types.ObjectId, "pin_reset");
    await sendVerificationCodeEmail(user.email, code, "pin_reset");

    res.status(200).json({ status: true, msg: "Enviamos um código de confirmação pro seu e-mail." });
  } catch (err: any) {
    console.error("❌ Erro em forgotPin:", err);
    res.status(429).json({ status: false, msg: err?.message || "Erro ao gerar código." });
  }
};

/* -------------------------------------------------------
🔐 4️⃣ Redefinir o PIN com o código recebido
POST /api/user/pin/reset
-------------------------------------------------------- */
export const resetPin = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { code, newPin, confirmNewPin } = req.body;
    if (!code || !newPin || !confirmNewPin) {
      res.status(400).json({ status: false, msg: "Código, novo PIN e confirmação são obrigatórios." });
      return;
    }
    if (!PIN_REGEX.test(newPin)) {
      res.status(400).json({ status: false, msg: "Novo PIN deve ter exatamente 4 dígitos numéricos." });
      return;
    }
    if (newPin !== confirmNewPin) {
      res.status(400).json({ status: false, msg: "A confirmação não bate com o novo PIN." });
      return;
    }

    const ok = await verifyCode(user._id as Types.ObjectId, "pin_reset", code);
    if (!ok) {
      res.status(400).json({ status: false, msg: "Código inválido ou expirado." });
      return;
    }

    user.withdrawalPin = { hash: await bcrypt.hash(newPin, 10), setAt: new Date() };
    await user.save();

    res.status(200).json({ status: true, msg: "✅ PIN de saque redefinido com sucesso." });
  } catch (err) {
    console.error("❌ Erro em resetPin:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao redefinir PIN." });
  }
};
