import { Transaction } from "../models/transaction.model";
import { Seller } from "../models/seller.model";
import { zendryFetchWithRetry } from "../lib/zendry/client";
import { mapZendryStatus } from "../lib/zendry/status-mapper";
import { applyZendryPaymentStatus } from "./zendryPaymentStatus.service";

interface ZendryQrcode {
  reference_code: string | null;
  status: string;
}

interface ZendryQrcodesPage {
  qrcodes?: ZendryQrcode[];
  meta?: { total_pages?: number };
}

/**
 * 🚦 Liga/desliga a confirmação Pix ao vivo — com true, refreshPendingPixIfNeeded
 * checa a Zendry ao vivo (throttlado) em toda consulta de status
 * (consultTransactionByID e getPayment já chamam essa função).
 *
 * Existiu uma trava de atraso proposital (5-10min, "alavanca comercial")
 * pensada pra quando isso estivesse false. Removida em 2026-08-13: além de
 * não ser mais desejada, ficou esquecida ligada mesmo com LIVE_CHECK_ENABLED
 * já revertido pra true em 09/08, e virou o teto real de confirmação de
 * pagamentos de verdade por dias sem ninguém perceber. Confirmação de Pix
 * agora é sempre o mais rápido que o live-check + reconciliação em lote
 * conseguirem, sem atraso artificial nenhum, ponto final.
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

export interface ReconciliationResult {
  checked: number;
  updated: number;
  errors: { transactionId: string; error: string }[];
}

// Checagem sob demanda de UMA transação — usada pelo consultTransactionByID,
// que o front chama a cada 1s enquanto o comprador espera confirmar o Pix na
// tela de checkout. O comprador está literalmente esperando na tela agora,
// então checa direto, sem esperar idade mínima nenhuma — só limita a 3
// páginas (a transação sendo consultada é sempre recente, deve estar no topo da lista)
// pra não fazer uma varredura cara a cada segundo. Throttle de quem chama
// fica por conta do caller (ver lastLiveCheckAt em transaction.controller.ts).
const SINGLE_CHECK_MAX_PAGES = 3;

export async function checkSingleZendryPix(externalId: string): Promise<{ applied: boolean }> {
  for (let page = 1; page <= SINGLE_CHECK_MAX_PAGES; page++) {
    let json: ZendryQrcodesPage;
    try {
      // Retry embutido (1x, 800ms) pra falha transitória (5xx) da Zendry —
      // achado em 2026-08-13: a API dela devolve 500 genérico sob carga
      // com alguma frequência, e antes disso qualquer erro aqui fazia o
      // comprador ficar "pending" na tela até o próximo ciclo de polling,
      // mesmo o pagamento já estando confirmado do lado da Zendry.
      json = await zendryFetchWithRetry<ZendryQrcodesPage>(`/v1/pix/qrcodes?page=${page}`, { method: "GET" });
    } catch (err) {
      console.error(`⚠️ Checagem ao vivo do Pix falhou (página ${page}, mesmo após retry):`, (err as Error).message);
      break;
    }

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

  let remaining = new Set(pendingByExternalId.keys());

  for (let page = 1; page <= MAX_PAGES && remaining.size > 0; page++) {
    let json: ZendryQrcodesPage;
    try {
      // Retry embutido (1x, 800ms) — mesmo motivo do checkSingleZendryPix:
      // sem isso, um único 5xx transitório da Zendry aborta a rodada
      // inteira de reconciliação, deixando todo mundo pendente até o
      // próximo ciclo.
      json = await zendryFetchWithRetry<ZendryQrcodesPage>(`/v1/pix/qrcodes?page=${page}`, { method: "GET" });
    } catch (err) {
      result.errors.push({ transactionId: "(lote)", error: `Falha ao buscar página ${page} da Zendry (após retry): ${(err as Error).message}` });
      break;
    }

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
