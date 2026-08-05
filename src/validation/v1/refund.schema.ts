import { z } from "zod";

/**
 * Schema do body de POST /v1/refunds. Só estorno TOTAL por enquanto (sem
 * `amount` parcial) — ver comentário em acquirers/pagarme.acquirer.ts sobre
 * por que estorno parcial não foi implementado ainda.
 */
export const publicRefundSchema = z.object({
  payment_id: z.string().min(1, "payment_id é obrigatório."),
  reason: z.string().max(500).optional(),
});

export type PublicRefundInput = z.infer<typeof publicRefundSchema>;
