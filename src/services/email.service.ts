import { Resend } from "resend";
import { VerificationPurpose } from "../models/verificationCode.model";

let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no ambiente.");
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const COPY: Record<VerificationPurpose, { subject: string; heading: string; body: string }> = {
  signup: {
    subject: "Confirme seu cadastro",
    heading: "Confirme seu e-mail",
    body: "Use o código abaixo pra confirmar seu cadastro e ativar sua conta.",
  },
  password_reset: {
    subject: "Redefinição de senha",
    heading: "Redefinir sua senha",
    body: "Use o código abaixo pra criar uma nova senha. Se você não pediu isso, ignore este e-mail.",
  },
  pin_reset: {
    subject: "Recuperação do PIN de saque",
    heading: "Redefinir seu PIN de saque",
    body: "Use o código abaixo pra definir um novo PIN de saque. Se você não pediu isso, ignore este e-mail.",
  },
};

/**
 * Envia o código de verificação por e-mail via Resend. Erros de envio
 * (API key inválida, domínio não verificado, etc.) sobem pro chamador —
 * nunca engolimos silenciosamente uma falha de envio de código.
 */
export async function sendVerificationCodeEmail(
  to: string,
  code: string,
  purpose: VerificationPurpose
): Promise<void> {
  const copy = COPY[purpose];
  const from = process.env.EMAIL_FROM || "Kissa <onboarding@resend.dev>";

  await getResendClient().emails.send({
    from,
    to,
    subject: copy.subject,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0B1020;">${copy.heading}</h2>
        <p style="color: #333;">${copy.body}</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0B1020; margin: 24px 0;">
          ${code}
        </p>
        <p style="color: #7E8799; font-size: 13px;">
          Esse código expira em 15 minutos. Não compartilhe com ninguém.
        </p>
      </div>
    `,
  });
}
