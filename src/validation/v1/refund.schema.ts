import { z } from "zod";

/**
 * Schema do body de POST /v1/refunds. Só estorno TOTAL por enquanto (sem
 * `amount` parcial) — a Zendry nunca teve o endpoint de estorno confirmado
 * (ver acquirers/zendry.acquirer.ts), então estorno parcial não tem como
 * ser implementado ainda de qualquer forma.
 */
export const publicRefundSchema = z.object({
  payment_id: z.string().min(1, "payment_id é obrigatório."),
  reason: z.string().max(500).optional(),
});

export type PublicRefundInput = z.infer<typeof publicRefundSchema>;
