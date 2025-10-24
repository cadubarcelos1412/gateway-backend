"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionSchema = void 0;
const zod_1 = require("zod");
exports.transactionSchema = zod_1.z.object({
    amount: zod_1.z.number().positive("O valor da transação deve ser maior que 0."),
    method: zod_1.z.enum(["pix", "credit_card", "boleto"], {
        message: "Método de pagamento inválido.",
    }),
    productId: zod_1.z.string().min(1, "O ID do produto é obrigatório."),
    description: zod_1.z.string().optional(),
    idempotencyKey: zod_1.z.string().optional(),
    customer: zod_1.z.object({
        name: zod_1.z.string().min(3, "O nome do cliente é obrigatório."),
        email: zod_1.z.string().email("E-mail inválido."),
        document: zod_1.z
            .string()
            .regex(/^\d{11}$|^\d{14}$/, "Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)."),
    }),
});
