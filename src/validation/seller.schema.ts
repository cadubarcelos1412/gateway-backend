import { z } from "zod";

export const sellerSchema = z.object({
  name: z.string().min(3, "Nome é obrigatório."),
  email: z.string().email("E-mail inválido."),
  phone: z.string().min(8, "Telefone é obrigatório."),
  type: z.enum(["PF", "PJ"], {
    message: "Tipo é obrigatório e deve ser 'PF' ou 'PJ'.",
  }),
  documentNumber: z
    .string()
    .regex(/^\d{11}$|^\d{14}$/, "Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)."),
  address: z.object({
    street: z.string().min(1, "Rua é obrigatória."),
    number: z.string().min(1, "Número é obrigatório."),
    district: z.string().min(1, "Bairro é obrigatório."),
    city: z.string().min(1, "Cidade é obrigatória."),
    state: z.string().min(2, "Estado é obrigatório."),
    postalCode: z.string().min(8, "CEP é obrigatório."),
  }),
});
