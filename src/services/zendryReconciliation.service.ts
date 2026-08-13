import crypto from "crypto";
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
 * 🚦 Chave liga/desliga da confirmação Pix ao vivo (decisão de negócio, não
 * técnica). Revertido em 2026-08-09: cliente pagou a implementação, então
 * confirmação volta a ser instantânea de novo (estava com delay proposital
 * de 5-10min desde 2026-08-09 como alavanca comercial). Com true,
 * refreshPendingPixIfNeeded volta a checar a Zendry ao vivo (throttlado) em
 * toda consulta de status — consultTransactionByID e getPayment já chamam
 * essa função. Se precisar desligar nesse mesmo cenário de novo: só trocar
 * pra false, nenhum outro código muda (o reconciliador em lote assume como
 * único mecanismo, com o delay-alvo por transação em
 * pixConfirmationDelayMinutes abaixo).
 */
const LIVE_CHECK_ENABLED = true;

/**
 * Rede de segurança pro problema confirmado em 2026-08-06: webhooks da
 * Zendry não chegam (URL de callback nunca foi (re)configurada pra essa
 * conta/deploy — ver zendryWebhook.controller.ts). Sem isso, um Pix pago de
 * verdade fica "pending" pra sempre no nosso sistema.
 *
 * Busca transações Pix "pending" há mais de MIN_AGE_MINUTES (evita competir
 * com o webhook/live-check em transações recém-criadas), varre as páginas
 * de /v1/pix/qrcodes da Zendry (o filtro por reference_code nesse endpoint
 * retorna 500 — confirmado, não use) e aplica o status real encontrado.
 *
 * Só cobre Pix por enquanto — cartão já tem confirmação síncrona na criação
 * (não depende de webhook pra saber se foi aprovado).
 */
const MIN_AGE_MINUTES = 0.5;
const MAX_PAGES = 10;

/**
 * 🚦 Decisão de negócio, não técnica — só entra em jogo quando
 * LIVE_CHECK_ENABLED=false (ver acima). Nesse modo, quem determina quando
 * um Pix "pending" vira "paid"/"failed" pro nosso sistema é só a
 * reconciliação em lote. Cada transação recebe um delay-alvo aleatório
 * (mas determinístico — mesma transação sempre cai no mesmo valor) entre 5
 * e 10 minutos, derivado de um hash do próprio id. Isso evita dois
 * problemas de uma janela de corte fixa: (1) todo mundo confirmando
 * exatamente no mesmo instante do relógio, o que pareceria um lote/batch
 * óbvio, e (2) transações "com sorte" que caem logo depois de uma rodada
 * confirmando quase instantâneo. Com LIVE_CHECK_ENABLED=true, essa função
 * quase nunca chega a barrar nada de verdade — a transação já foi
 * confirmada pelo live-check antes de aparecer aqui.
 */
function pixConfirmationDelayMinutes(transactionId: string): number {
  const hash = crypto.createHash("md5").update(transactionId).digest();
  const fraction = hash.readUInt32BE(0) / 0xffffffff; // 0..1, determinístico por id
  return 5 + fraction * 5; // 5.0 a 10.0 minutos
}

export interface ReconciliationResult {
  checked: number;
  updated: number;
  errors: { transactionId: string; error: string }[];
}

// Checagem sob demanda de UMA transação — usada pelo consultTransactionByID,
// que o front chama a cada 1s enquanto o comprador espera confirmar o Pix na
// tela de checkout. Diferente da varredura em lote (que respeita o
// delay-alvo de cada transação, ver pixConfirmationDelayMinutes), aqui o
// comprador está literalmente esperando na tela agora, então
// checa direto, sem esperar idade mínima — só limita a 3 páginas (a
// transação sendo consultada é sempre recente, deve estar no topo da lista)
// pra não fazer uma varredura cara a cada segundo. Throttle de quem chama
// fica por conta do caller (ver lastLiveCheckAt em transaction.controller.ts).
const SINGLE_CHECK_MAX_PAGES = 3;

export async function checkSingleZendryPix(externalId: string): Promise<{ applied: boolean }> {
  const token = await getZendryAccessToken();

  for (let page = 1; page <= SINGLE_CHECK_MAX_PAGES; page++) {
    const res = await fetch(`${ZENDRY_API_BASE}/v1/pix/qrcodes?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;

    const json = (await res.json()) as { qrcodes?: ZendryQrcode[]; meta?: { total_pages?: number } };
    const match = (json.qrcodes || []).find((qr) => qr.reference_code === externalId);

    if (match) {
      const mappedStatus = mapZendryStatus(match.status);
      if (mappedStatus === "pending") return { applied: false };
      const result = await applyZendryPaymentStatus(externalId, mappedStatus);
      return { applied: result.applied };
    }

    if (page >= (json.meta?.total_pages || 1)) break;
  }

  return { applied: false };
}

// Throttle compartilhado — qualquer caller que consulte o status de uma
// transação (checkout hospedado por nós OU a API pública /v1/payments, ver
// consultTransactionByID e getPayment) passa por aqui em vez de bater na
// Zendry a cada request. Em memória: pior caso de um restart é uma checagem
// a mais, sem problema.
const lastLiveCheckAt = new Map<string, number>();
const LIVE_CHECK_MIN_GAP_MS = 4_000;

interface PixLikeTransaction {
  _id: unknown;
  status: string;
  method: string;
  mode: string;
  externalId?: string | null;
}

/**
 * Se a transação for um Pix "pending" em modo live, checa a Zendry ao vivo
 * (throttlado). Retorna true se o status mudou — quem chama deve recarregar
 * a transação do banco antes de responder.
 */
export async function refreshPendingPixIfNeeded(transaction: PixLikeTransaction): Promise<boolean> {
  if (!LIVE_CHECK_ENABLED) return false;
  if (transaction.status !== "pending" || transaction.method !== "pix" || transaction.mode !== "live" || !transaction.externalId) {
    return false;
  }

  const key = String(transaction._id);
  const now = Date.now();
  const last = lastLiveCheckAt.get(key) || 0;
  if (now - last < LIVE_CHECK_MIN_GAP_MS) return false;
  lastLiveCheckAt.set(key, now);

  try {
    const { applied } = await checkSingleZendryPix(transaction.externalId);
    if (applied) lastLiveCheckAt.delete(key); // resolvida — libera memória
    return applied;
  } catch (err) {
    console.error("⚠️ Falha na checagem ao vivo do Pix (segue com o status em cache):", err);
    return false;
  }
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

      const tx = pendingByExternalId.get(qr.reference_code);
      if (tx) {
        const ageMinutes = (Date.now() - tx.createdAt.getTime()) / 60_000;
        if (ageMinutes < pixConfirmationDelayMinutes(String(tx._id))) continue; // ainda não bateu o delay-alvo desta transação — tenta de novo no próximo ciclo
      }

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
