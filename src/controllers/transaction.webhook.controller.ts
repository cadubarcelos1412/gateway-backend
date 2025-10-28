// src/controllers/transaction.webhook.controller.ts
import { Request, Response } from "express";
import crypto from "crypto";
import { Transaction } from "../models/transaction.model";
import { TransactionAuditService } from "../services/transactionAudit.service";
import { Types } from "mongoose";
import { RiskFlag } from "../services/riskEngine";

/**
 * 🧩 Webhook Listener — Pagar.me (API v5) → KissaPay
 *
 * Recebe notificações de atualização de status da Pagar.me (API v5)
 * e sincroniza com o banco de dados local.
 *
 * Eventos esperados:
 *  - charge.paid
 *  - charge.pending
 *  - charge.failed
 *  - order.paid
 *  - order.canceled
 */
export const pagarmeWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("📥 Webhook recebido:", JSON.stringify(req.body, null, 2));

    // 1️⃣ Validação opcional de assinatura (comentada por enquanto)
    // A Pagar.me v5 pode usar Basic Auth ou outros métodos
    const secret = process.env.PAGARME_WEBHOOK_SECRET || "";
    const signature = req.headers["x-hub-signature"] as string;

    if (secret && signature) {
      const expected = `sha1=${crypto
        .createHmac("sha1", secret)
        .update(JSON.stringify(req.body))
        .digest("hex")}`;

      if (signature !== expected) {
        console.warn("⚠️ Assinatura inválida recebida no webhook Pagar.me");
        res.status(403).json({ status: false, msg: "Assinatura inválida." });
        return;
      }
    }

    // 2️⃣ Extrai os dados principais do webhook da Pagar.me v5
    const payload = req.body;
    
    // O webhook da v5 pode vir com diferentes estruturas
    // Exemplo: { id: "or_xxx", charges: [...], status: "pending", ... }
    const orderId = payload.id;
    const orderCode = payload.code;
    const orderStatus = payload.status;
    const charges = payload.charges || [];
    
    // Pega a primeira cobrança (charge)
    const charge = charges[0];
    const chargeId = charge?.id;
    const chargeStatus = charge?.status;
    const lastTransaction = charge?.last_transaction;

    // Identifica qual ID usar para buscar a transação
    const transactionId = chargeId || orderId;
    const externalCode = orderCode || chargeId;

    // Determina o status final
    const newStatus = mapPagarmeStatus(chargeStatus || orderStatus);

    if (!transactionId) {
      console.warn("⚠️ Payload inválido: ID ausente");
      res.status(400).json({ status: false, msg: "Payload inválido: ID ausente." });
      return;
    }

    console.log(`🔍 Buscando transação com externalId: ${externalCode} ou ${transactionId}`);

    // 3️⃣ Busca a transação correspondente
    const transaction = await Transaction.findOne({
      $or: [
        { externalId: externalCode },
        { externalId: transactionId },
        { externalId: orderId },
      ],
    });

    if (!transaction) {
      console.warn(`⚠️ Webhook ignorado: transação não encontrada (${transactionId})`);
      // Retorna 200 mesmo assim para evitar reenvios
      res.status(200).json({ 
        status: true, 
        msg: "Webhook recebido, mas transação não encontrada (normal para testes)." 
      });
      return;
    }

    const oldStatus = transaction.status;
    
    // Só atualiza se o status mudou
    if (oldStatus !== newStatus) {
      transaction.status = newStatus;
      await transaction.save();

      // 4️⃣ Registra auditoria antifraude
      await TransactionAuditService.log({
        transactionId: new Types.ObjectId(String(transaction._id)),
        sellerId: new Types.ObjectId(String(transaction.sellerId)),
        userId: new Types.ObjectId(String(transaction.userId || transaction.sellerId)),
        amount: transaction.amount,
        method: transaction.method,
        status: mapAuditStatus(newStatus),
        flags: (transaction.flags || []) as RiskFlag[],
        kycStatus: "verified",
        description: `Webhook Pagar.me v5 — ${oldStatus} → ${newStatus}`,
      });

      console.log(
        `✅ [Webhook Pagar.me v5] Transação ${transactionId} atualizada: ${oldStatus} → ${newStatus}`
      );
    } else {
      console.log(`ℹ️ Status já está atualizado: ${newStatus}`);
    }

    // 5️⃣ Retorna confirmação (SEMPRE 200 OK para evitar reenvios)
    res.status(200).json({
      status: true,
      msg: "Webhook Pagar.me v5 processado com sucesso.",
      transactionId,
      newStatus,
    });
  } catch (error) {
    console.error("❌ Erro ao processar webhook Pagar.me v5:", error);
    // Retorna 200 mesmo com erro para evitar loop de reenvios
    res.status(200).json({
      status: false,
      msg: "Erro ao processar webhook, mas confirmando recebimento.",
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🔄 Mapeamento de status da Pagar.me v5 → Kissa                              */
/* -------------------------------------------------------------------------- */
function mapPagarmeStatus(
  status: string
): "pending" | "approved" | "failed" | "refunded" {
  switch (status?.toLowerCase()) {
    case "paid":
    case "authorized":
      return "approved";
    case "processing":
    case "pending":
    case "waiting_payment":
      return "pending";
    case "failed":
    case "canceled":
    case "refused":
    case "chargedback":
      return "failed";
    case "refunded":
      return "refunded";
    default:
      console.warn(`⚠️ Status desconhecido: ${status}`);
      return "pending";
  }
}

/* -------------------------------------------------------------------------- */
/* 🧮 Ajuste de status para compatibilidade com auditoria interna             */
/* -------------------------------------------------------------------------- */
function mapAuditStatus(
  status: "pending" | "approved" | "failed" | "refunded"
): "pending" | "approved" | "failed" | "blocked" {
  if (status === "refunded") return "blocked";
  return status;
}