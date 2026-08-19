// src/services/splitRule.service.ts
import { SplitRule } from "../models/splitRule.model";

/**
 * Fecha de vez as parcerias cuja carência de revogação já passou —
 * revokeSplitRule só agenda (mantém status "active" com revokeEffectiveAt no
 * futuro); esse sweep é quem realmente muda pra "revoked" quando a data
 * chega. Rodar periodicamente (ver server.ts) mantém a listagem/status
 * corretos mesmo sem ninguém abrindo a tela — a proteção que realmente
 * importa pro dinheiro (não pagar split depois da carência) já está
 * duplicada como filtro defensivo direto em transaction.service.ts, então
 * atraso nesse sweep não causa pagamento indevido, só deixa o status
 * "active" por mais tempo do que deveria na tela.
 */
export async function revokeMaturedSplitRules(): Promise<{ revoked: number }> {
  const result = await SplitRule.updateMany(
    { status: "active", revokeEffectiveAt: { $lte: new Date() } },
    { $set: { status: "revoked" } }
  );
  return { revoked: result.modifiedCount };
}
