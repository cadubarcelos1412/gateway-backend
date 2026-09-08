import { z } from "zod";

export const transactionSchema = z
  .object({
    amount: z.number().positive("O valor da transação deve ser maior que 0."),

    method: z.enum(["pix", "credit_card", "boleto"], {
      message: "Método de pagamento inválido.",
    }),

    productId: z.string().min(1, "O ID do produto é obrigatório."),

    description: z.string().optional(),

    idempotencyKey: z.string().optional(),

    customer: z.object({
      name: z.string().min(3, "O nome do cliente é obrigatório."),
      email: z.string().email("E-mail inválido.").optional(),
      document: z
        .string()
        .regex(/^\d{11}$|^\d{14}$/, "Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos).")
        .optional(),
      phone: z.string().optional(),
    }),

    // 💳 Dados de cartão — obrigatórios quando method === "credit_card" e a
    // adquirente do seller exige o número/CVV diretamente (ex: Zendry).
    card: z
      .object({
        number: z.string().min(13).max(19),
        holderName: z.string().min(3),
        expirationDate: z.string().regex(/^\d{6}$/, "Formato esperado: MMyyyy."),
        securityCode: z.string().regex(/^\d{3,4}$/),
        installments: z.number().int().min(1).max(14),
      })
      .optional(),

    // 🔐 Dados de autenticação 3DS calculados no navegador (ex: SDK da
    // Zendry) — bag genérico, cada adquirente valida o shape exato que espera.
    threedsData: z.record(z.string(), z.string()).optional(),
  })
  .refine(
    (data) => data.method !== "credit_card" || !!data.card,
    { message: "Dados de cartão são obrigatórios para method 'credit_card'.", path: ["card"] }
  )
  .refine(
    (data) => data.method !== "credit_card" || !!data.threedsData,
    { message: "threedsData é obrigatório para method 'credit_card'.", path: ["threedsData"] }
  )
  // 📱 Pix aceita telefone no lugar de email+document (sujeito à autorização
  // da conta, ver TransactionService.createTransactionCore). Cartão/boleto
  // continuam exigindo email+document sempre.
  .refine(
    (data) =>
      data.method === "pix"
        ? !!data.customer.phone || (!!data.customer.email && !!data.customer.document)
        : !!data.customer.email && !!data.customer.document,
    {
      message:
        "Para Pix, informe customer.phone, ou customer.email e customer.document. Para os demais métodos, email e document são sempre obrigatórios.",
      path: ["customer"],
    }
  );
