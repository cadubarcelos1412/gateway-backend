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
  login_2fa: {
    subject: "Código de verificação de login",
    heading: "Confirme que é você",
    body: "Detectamos uma tentativa de login na sua conta PyxGate. Use o código abaixo pra confirmar e continuar. Se não foi você, troque sua senha assim que possível.",
  },
};

// Fontes de e-mail: Sora/Inter não são garantidas pelos clientes (Outlook em
// particular ignora @font-face), então usamos elas como preferência e caímos
// num stack de sistema seguro.
const FONT_HEADING = "'Sora', 'Segoe UI', Helvetica, Arial, sans-serif";
const FONT_BODY = "'Inter', 'Segoe UI', Helvetica, Arial, sans-serif";
const LOGO_URL =
  "https://res.cloudinary.com/dbclkaipz/image/upload/v1786333415/pyxgate/brand/pyxgate-logo-horizontal.png";

function renderVerificationEmail(heading: string, body: string, code: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0; padding:0; background-color:#F7F9FC;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F9FC; padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:100%; background-color:#FFFFFF; border-radius:16px; border:1px solid #EEF1F6;">
            <!-- Logo -->
            <tr>
              <td style="padding:36px 40px 0 40px;">
                <img src="${LOGO_URL}" alt="PyxGate" width="160" height="48" style="display:block; border:0; outline:none; width:160px; height:48px;" />
              </td>
            </tr>
            <!-- Divisor -->
            <tr>
              <td style="padding:20px 40px 0 40px;">
                <div style="height:3px; width:40px; background-color:#00D084; border-radius:2px;"></div>
              </td>
            </tr>
            <!-- Título e corpo -->
            <tr>
              <td style="padding:20px 40px 0 40px;">
                <h1 style="margin:0; font-family:${FONT_HEADING}; font-size:22px; line-height:1.3; color:#0B1020;">${heading}</h1>
                <p style="margin:12px 0 0 0; font-family:${FONT_BODY}; font-size:15px; line-height:1.6; color:#4B5565;">${body}</p>
              </td>
            </tr>
            <!-- Código -->
            <tr>
              <td style="padding:28px 40px 0 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F9FC; border:1px solid #E3E8F0; border-radius:12px;">
                  <tr>
                    <td align="center" style="padding:24px 16px;">
                      <span style="font-family:'Courier New', Courier, monospace; font-size:34px; font-weight:700; letter-spacing:10px; color:#0B1020;">${code}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Aviso de expiração -->
            <tr>
              <td style="padding:16px 40px 0 40px;">
                <p style="margin:0; font-family:${FONT_BODY}; font-size:13px; line-height:1.6; color:#7E8799;">
                  Esse código expira em 15 minutos. Não compartilhe com ninguém, nem com alguém que diga trabalhar na PYX GATE.
                </p>
              </td>
            </tr>
            <!-- Rodapé -->
            <tr>
              <td style="padding:32px 40px 32px 40px;">
                <div style="height:1px; background-color:#EEF1F6; margin-bottom:20px;"></div>
                <p style="margin:0; font-family:${FONT_BODY}; font-size:12px; line-height:1.6; color:#A2ABB9;">
                  Este é um e-mail automático — não responda. Se você não solicitou isso, pode ignorar com segurança.<br />
                  © ${new Date().getFullYear()} PYX GATE
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

function renderActionEmail(heading: string, body: string, buttonLabel: string, buttonUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0; padding:0; background-color:#F7F9FC;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F9FC; padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:100%; background-color:#FFFFFF; border-radius:16px; border:1px solid #EEF1F6;">
            <!-- Logo -->
            <tr>
              <td style="padding:36px 40px 0 40px;">
                <img src="${LOGO_URL}" alt="PyxGate" width="160" height="48" style="display:block; border:0; outline:none; width:160px; height:48px;" />
              </td>
            </tr>
            <!-- Divisor -->
            <tr>
              <td style="padding:20px 40px 0 40px;">
                <div style="height:3px; width:40px; background-color:#00D084; border-radius:2px;"></div>
              </td>
            </tr>
            <!-- Título e corpo -->
            <tr>
              <td style="padding:20px 40px 0 40px;">
                <h1 style="margin:0; font-family:${FONT_HEADING}; font-size:22px; line-height:1.3; color:#0B1020;">${heading}</h1>
                <p style="margin:12px 0 0 0; font-family:${FONT_BODY}; font-size:15px; line-height:1.6; color:#4B5565;">${body}</p>
              </td>
            </tr>
            <!-- Botão -->
            <tr>
              <td style="padding:28px 40px 0 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border-radius:10px; background-color:#00D084;">
                      <a href="${buttonUrl}" style="display:inline-block; padding:14px 28px; font-family:${FONT_HEADING}; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">
                        ${buttonLabel}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Rodapé -->
            <tr>
              <td style="padding:32px 40px 32px 40px;">
                <div style="height:1px; background-color:#EEF1F6; margin-bottom:20px;"></div>
                <p style="margin:0; font-family:${FONT_BODY}; font-size:12px; line-height:1.6; color:#A2ABB9;">
                  Este é um e-mail automático — não responda. Se você não esperava isso, pode ignorar com segurança.<br />
                  © ${new Date().getFullYear()} PYX GATE
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

/**
 * Envia o convite de parceria (split de vendas) por e-mail. Best-effort —
 * a parceria já existe como "pending" independente do e-mail sair ou não,
 * então erro de envio aqui nunca deve derrubar a criação da parceria.
 */
export async function sendPartnershipInviteEmail(
  to: string,
  payerName: string,
  percentage: number,
  actionUrl: string
): Promise<void> {
  const from = process.env.EMAIL_FROM || "PyxGate <onboarding@resend.dev>";

  await getResendClient().emails.send({
    from,
    to,
    subject: `Você foi convidado pra ser parceiro de ${payerName}`,
    html: renderActionEmail(
      `Você foi convidado pra ser parceiro de ${payerName}`,
      `${payerName} quer dividir automaticamente <strong>${percentage}%</strong> do valor líquido das vendas dele(a) com você. Acesse sua conta pra aceitar ou recusar esse convite.`,
      "Ver convite",
      actionUrl
    ),
  });
}

/**
 * Envia o aviso de proposta de mudança de percentual numa parceria já
 * ativa. Best-effort, mesmo padrão do convite — a proposta já existe como
 * pendingPercentage independente do e-mail sair ou não.
 */
export async function sendPartnershipPercentageChangeEmail(
  to: string,
  payerName: string,
  currentPercentage: number,
  proposedPercentage: number,
  actionUrl: string
): Promise<void> {
  const from = process.env.EMAIL_FROM || "PyxGate <onboarding@resend.dev>";
  const direction = proposedPercentage > currentPercentage ? "aumentar" : "diminuir";

  await getResendClient().emails.send({
    from,
    to,
    subject: `${payerName} quer mudar o percentual da parceria com você`,
    html: renderActionEmail(
      `${payerName} propôs mudar o percentual da parceria`,
      `${payerName} quer ${direction} o percentual que você recebe das vendas dele(a): de <strong>${currentPercentage}%</strong> pra <strong>${proposedPercentage}%</strong>. A parceria continua valendo no percentual atual até você aceitar ou recusar essa mudança.`,
      "Ver proposta",
      actionUrl
    ),
  });
}

/**
 * Avisa o destinatário que o pagador pediu pra revogar a parceria — a
 * parceria continua valendo (splits continuam sendo pagos) até a data de
 * carência, informada aqui. Best-effort, mesmo padrão dos outros e-mails de
 * parceria: a revogação já foi registrada independente do e-mail sair.
 *
 * Criado em 2026-08-18: revogar sempre foi imediato e mudo — o destinatário
 * só descobria quando um repasse esperado simplesmente não chegava.
 */
export async function sendPartnershipRevokedEmail(
  to: string,
  payerName: string,
  percentage: number,
  effectiveDate: Date,
  actionUrl: string
): Promise<void> {
  const from = process.env.EMAIL_FROM || "PyxGate <onboarding@resend.dev>";
  const formattedDate = effectiveDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  await getResendClient().emails.send({
    from,
    to,
    subject: `${payerName} encerrou a parceria com você`,
    html: renderActionEmail(
      `${payerName} encerrou a parceria com você`,
      `${payerName} pediu pra encerrar a parceria de <strong>${percentage}%</strong> das vendas dele(a) com você. Ela continua valendo normalmente até <strong>${formattedDate}</strong> — depois disso, para de gerar repasse.`,
      "Ver parceria",
      actionUrl
    ),
  });
}

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
  const from = process.env.EMAIL_FROM || "PyxGate <onboarding@resend.dev>";

  await getResendClient().emails.send({
    from,
    to,
    subject: copy.subject,
    html: renderVerificationEmail(copy.heading, copy.body, code),
  });
}
