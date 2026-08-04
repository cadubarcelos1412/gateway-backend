import type { ZendryVerificationStatus } from "./types";

// A documentação da Zendry NÃO especifica os valores exatos de `status` nos
// webhooks de pix_qrcode/card_payment/checkout — este mapeamento é por
// substring, case-insensitive, tolerante a variações. Testado contra os
// payloads reais recebidos em produção no projeto de origem. Se a Zendry
// mandar um status novo que não bata em nenhuma regex, cai em "pending" —
// prefira isso a interpretar errado um pagamento como aprovado/recusado.
export function mapZendryStatus(rawStatus: string | undefined | null): ZendryVerificationStatus {
  const s = (rawStatus ?? "").toLowerCase();
  if (/paid|complet|confirm|approv|success|accepted/.test(s)) return "approved";
  if (/cancel|expir|refund|chargeback/.test(s)) return "cancelled";
  if (/reject|fail|denied|declin|refus/.test(s)) return "rejected";
  return "pending";
}

// Taxa de cartão por número de parcelas — tabela real de adquirente (varia
// por conta/negociação; ajuste os valores pros seus quando migrar). Índice 0
// = à vista (1x). NÃO é markup fixo — a taxa sobe conforme a parcela.
export const CARD_INSTALLMENT_RATES: number[] = [
  0.0685, 0.0815, 0.0884, 0.0954, 0.1024, 0.1095, 0.1186,
  0.1259, 0.1331, 0.1405, 0.1479, 0.1554, 0.1629, 0.1705,
];

export const MAX_CARD_INSTALLMENTS = CARD_INSTALLMENT_RATES.length;

export function getCardInstallmentRate(installments: number): number {
  const idx = Math.min(Math.max(1, Math.round(installments) || 1), MAX_CARD_INSTALLMENTS) - 1;
  return CARD_INSTALLMENT_RATES[idx];
}

// Total cobrado no cartão = valor base (Pix) + taxa da parcela escolhida.
// SEMPRE recalcule isso no servidor a partir de um valor de referência que
// você controla (ex.: o total do pedido no seu banco) — nunca confie num
// total mandado pelo cliente.
export function computeCardTotal(baseBRL: number, installments: number): number {
  const safeBase = Math.max(0, Number(baseBRL) || 0);
  const rate = getCardInstallmentRate(installments);
  return Math.round(safeBase * (1 + rate) * 100) / 100;
}
