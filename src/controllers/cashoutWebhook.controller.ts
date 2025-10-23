import { Request, Response } from "express";
import { CashoutWebhookService } from "../services/cashoutWebhook.service";

export const bankCashoutWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = req.body;

    // 🔒 Validação mínima do payload
    if (!event?.cashoutId || !event?.amount) {
      res.status(400).json({ status: false, msg: "Payload inválido." });
      return;
    }

    // (opcional futuramente: validar assinatura do banco via HMAC)
    // validateBankSignature(req.headers["x-bank-signature"], event);

    await CashoutWebhookService.processBankWebhook(event);

    res.status(200).json({ status: true, msg: "✅ Webhook processado com sucesso." });
  } catch (error: any) {
    console.error("❌ Erro no webhook bancário:", error);
    res.status(500).json({ status: false, msg: error.message || "Erro interno." });
  }
};
