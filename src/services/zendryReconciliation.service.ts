import { Transaction } from "../models/transaction.model";
import { Seller } from "../models/seller.model";
import { getZendryAccessToken, ZENDRY_API_BASE } from "../lib/zendry/client";
import { mapZendryStatus } from "../lib/zendry/status-mapper";
import { applyZendryPaymentStatus } from "./zendryPaymentStatus.service";

interface ZendryQrcode {
  reference_code: string | null;
  status: string;
}

/**
 * Rede de segurança pro problema confirmado em 2026-08-06: webhooks da
 * Zendry não chegam (URL de callback nunca foi (re)configurada pra essa
 * conta/deploy — ver zendryWebhook.controller.ts). Sem isso, um Pix pago de
 * verdade fica "pending" pra sempre no nosso sistema.
 *
 * Busca transações Pix "pending" há mais de MIN_AGE_MINUTES (evita competir
 * com o webhook em transações recém-criadas), varre as páginas de
 * /v1/pix/qrcodes da Zendry (o filtro por reference_code nesse endpoint
 * retorna 500 — confirmado, não use) e aplica o status real encontrado.
 *
 * Só cobre Pix por enquanto — cartão já tem confirmação síncrona na criação
 * (não depende de webhook pra saber se foi aprovado).
 */
const MIN_AGE_MINUTES = 3;
const MAX_PAGES = 10;

export interface ReconciliationResult {
  checked: number;
  updated: number;
  errors: { transactionId: string; error: string }[];
}

export async function reconcilePendingZendryPix(): Promise<ReconciliationResult> {
  const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60 * 1000);

  const zendrySellerIds = (await Seller.find({ acquirer: "zendry" }).select("userId")).map((s) => s.userId);

  const pending = await Transaction.find({
    method: "pix",
    mode: "live",
    status: "pending",
    createdAt: { $lte: cutoff },
    userId: { $in: zendrySellerIds },
  }).limit(500);

  const result: ReconciliationResult = { checked: pending.length, updated: 0, errors: [] };
  if (pending.length === 0) return result;

  const pendingByExternalId = new Map(pending.map((tx) => [tx.externalId, tx]));

  const token = await getZendryAccessToken();
  let remaining = new Set(pendingByExternalId.keys());

  for (let page = 1; page <= MAX_PAGES && remaining.size > 0; page++) {
    const res = await fetch(`${ZENDRY_API_BASE}/v1/pix/qrcodes?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;

    const json = (await res.json()) as { qrcodes?: ZendryQrcode[]; meta?: { total_pages?: number } };
    const qrcodes = json.qrcodes || [];

    for (const qr of qrcodes) {
      if (!qr.reference_code || !remaining.has(qr.reference_code)) continue;

      const mappedStatus = mapZendryStatus(qr.status);
      if (mappedStatus === "pending") continue; // ainda não resolvido de verdade na Zendry

      try {
        const applyResult = await applyZendryPaymentStatus(qr.reference_code, mappedStatus);
        if (applyResult.applied) result.updated++;
      } catch (err) {
        result.errors.push({
          transactionId: String(pendingByExternalId.get(qr.reference_code)?._id),
          error: (err as Error).message,
        });
      }

      remaining.delete(qr.reference_code);
    }

    if (page >= (json.meta?.total_pages || 1)) break;
  }

  return result;
}
