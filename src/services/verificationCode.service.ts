import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { VerificationCode, VerificationPurpose } from "../models/verificationCode.model";

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const RESEND_COOLDOWN_MS = 60 * 1000; // 60s entre reenvios do mesmo propósito
const MAX_ATTEMPTS = 5;

function generateNumericCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Sem 0/O, 1/I/L — caracteres que se confundem visualmente, importante pra
// um código que o usuário vai digitar de cabeça a partir do e-mail.
const ALPHANUMERIC_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateAlphanumericCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ALPHANUMERIC_CHARSET[crypto.randomInt(0, ALPHANUMERIC_CHARSET.length)];
  }
  return code;
}

function generateCode(purpose: VerificationPurpose): string {
  return purpose === "login_2fa" ? generateAlphanumericCode() : generateNumericCode();
}

/**
 * Gera um código de 6 dígitos, salva só o HASH, e devolve o código em texto
 * puro (existe só nesta chamada — quem chama manda por e-mail na hora e
 * descarta a variável; nunca é persistido em claro em lugar nenhum).
 */
export async function createVerificationCode(
  userId: Types.ObjectId,
  purpose: VerificationPurpose
): Promise<string> {
  const last = await VerificationCode.findOne({ userId, purpose }).sort({ createdAt: -1 });
  if (last && !last.consumedAt && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil(
      (RESEND_COOLDOWN_MS - (Date.now() - last.createdAt.getTime())) / 1000
    );
    throw new Error(`Aguarde ${waitSeconds}s antes de pedir um novo código.`);
  }

  const code = generateCode(purpose);
  const codeHash = await bcrypt.hash(code, 10);

  await VerificationCode.create({
    userId,
    purpose,
    codeHash,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  return code;
}

/**
 * Valida o código mais recente ainda não consumido do propósito. Incrementa
 * `attempts` em caso de erro (bloqueia depois de MAX_ATTEMPTS — força pedir
 * um código novo em vez de tentar adivinhar).
 */
export async function verifyCode(
  userId: Types.ObjectId,
  purpose: VerificationPurpose,
  submittedCode: string
): Promise<boolean> {
  const record = await VerificationCode.findOne({
    userId,
    purpose,
    consumedAt: { $exists: false },
  }).sort({ createdAt: -1 });

  if (!record) return false;
  if (record.expiresAt.getTime() < Date.now()) return false;
  if (record.attempts >= MAX_ATTEMPTS) return false;

  const matches = await bcrypt.compare(submittedCode.trim().toUpperCase(), record.codeHash);
  if (!matches) {
    record.attempts += 1;
    await record.save();
    return false;
  }

  record.consumedAt = new Date();
  await record.save();
  return true;
}
