import { z } from "zod";

export const transactionSchema = z.object({
  amount: z.number().positive("O valor da transação deve ser maior que 0."),

  method: z.enum(["pix", "credit_card", "boleto"], {
    message: "Método de pagamento inválido.",
  }),

  productId: z.string().min(1, "O ID do produto é obrigatório."),

  description: z.string().optional(),

  idempotencyKey: z.string().optional(),

  customer: z.object({
    name: z.string().min(3, "O nome do cliente é obrigatório."),
    email: z.string().email("E-mail inválido."),
    document: z
      .string()
      .regex(/^\d{11}$|^\d{14}$/, "Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)."),
  }),
});
