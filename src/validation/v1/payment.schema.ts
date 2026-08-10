import { z } from "zod";

/**
 * Schema do body de POST /v1/payments. Convenção pública: valores em
 * centavos (integer), payment_method "pix" | "card" (mapeado internamente
 * para "pix" | "credit_card").
 */
export const publicPaymentSchema = z
  .object({
    amount: z.number().int().positive("amount deve ser um inteiro positivo, em centavos."),
    currency: z.literal("BRL").default("BRL"),
    payment_method: z.enum(["pix", "card"], { message: "payment_method inválido." }),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),

    customer: z.object({
      name: z.string().min(3, "customer.name é obrigatório."),
      email: z.string().email("customer.email inválido."),
      document: z
        .string()
        .regex(/^\d{11}$|^\d{14}$/, "customer.document deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)."),
      phone: z.string().optional(),
    }),

    card: z
      .object({
        number: z.string().min(13).max(19),
        holder_name: z.string().min(3),
        /** Formato "MMyyyy", ex.: "122029". */
        expiration_date: z.string().regex(/^\d{6}$/, "Formato esperado: MMyyyy."),
        security_code: z.string().regex(/^\d{3,4}$/),
        installments: z.number().int().min(1).max(14).default(1),
      })
      .optional(),

    threeds_data: z.record(z.string(), z.string()).optional(),
  })
  .refine((data) => data.payment_method !== "card" || !!data.card, {
    message: "'card' é obrigatório quando payment_method é 'card'.",
    path: ["card"],
  })
  .refine((data) => data.payment_method !== "card" || !!data.threeds_data, {
    message: "'threeds_data' é obrigatório quando payment_method é 'card' (calculado via SDK 3DS no navegador do comprador).",
    path: ["threeds_data"],
  })
  // 🚨 Direção inversa do refine acima — sem isso, um integrador que manda
  // payment_method:"pix" mas ANEXA dados de cartão (bug comum: campo de
  // método não atualizado no formulário deles, mas o resto do payload de
  // cartão sim) tinha o card silenciosamente descartado e a cobrança criada
  // como Pix — o comprador nunca era cobrado no cartão, e a venda aparecia
  // errada pro seller. Confirmado em produção em 2026-08-10: 100% das
  // transações via API sempre foram "pix", nunca "credit_card", em toda a
  // história do sistema.
  .refine((data) => data.payment_method === "card" || !data.card, {
    message: "'card' só pode ser enviado quando payment_method é 'card'. Confira o valor de payment_method no seu integração.",
    path: ["payment_method"],
  });

export type PublicPaymentInput = z.infer<typeof publicPaymentSchema>;
