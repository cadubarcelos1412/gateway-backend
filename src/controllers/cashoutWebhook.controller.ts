import crypto from "crypto";
import { Request, Response } from "express";
import { CashoutWebhookService } from "../services/cashoutWebhook.service";

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export const bankCashoutWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    // 🔒 Achado CRÍTICO em auditoria de segurança (2026-08-30): esse endpoint
    // não verificava assinatura/segredo NENHUM — qualquer requisição externa
    // com um cashoutId válido (ObjectId do Mongo, enumerável) e um amount
    // forjava confirmação de liquidação bancária, gravando lançamento de
    // ledger real e marcando o saque como "completed" sem o banco ter
    // liquidado nada de verdade. `INTERNAL_WEBHOOK_SECRET` já existe nas env
    // vars de produção (achado na mesma auditoria) — o esperado é que esse
    // endpoint já fosse gated por ele, mas a checagem nunca foi implementada
    // (só um comentário "opcional futuramente"). Fail-closed: sem o segredo
    // configurado OU sem o header batendo, a requisição é rejeitada.
    const providedSecret = req.headers["x-internal-webhook-secret"];
    const expectedSecret = process.env.INTERNAL_WEBHOOK_SECRET;
    if (
      !expectedSecret ||
      typeof providedSecret !== "string" ||
      !timingSafeEqualStrings(providedSecret, expectedSecret)
    ) {
      res.status(401).json({ status: false, msg: "Não autorizado." });
      return;
    }

    const event = req.body;

    // 🔒 Validação mínima do payload
    if (!event?.cashoutId || !event?.amount) {
      res.status(400).json({ status: false, msg: "Payload inválido." });
      return;
    }

    await CashoutWebhookService.processBankWebhook(event);

    res.status(200).json({ status: true, msg: "✅ Webhook processado com sucesso." });
  } catch (error: any) {
    console.error("❌ Erro no webhook bancário:", error);
    res.status(500).json({ status: false, msg: error.message || "Erro interno." });
  }
};
