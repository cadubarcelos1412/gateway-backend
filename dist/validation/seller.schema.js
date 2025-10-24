"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerSchema = void 0;
const zod_1 = require("zod");
exports.sellerSchema = zod_1.z.object({
    name: zod_1.z.string().min(3, "Nome é obrigatório."),
    email: zod_1.z.string().email("E-mail inválido."),
    phone: zod_1.z.string().min(8, "Telefone é obrigatório."),
    type: zod_1.z.enum(["PF", "PJ"], {
        message: "Tipo é obrigatório e deve ser 'PF' ou 'PJ'.",
    }),
    documentNumber: zod_1.z
        .string()
        .regex(/^\d{11}$|^\d{14}$/, "Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)."),
    address: zod_1.z.object({
        street: zod_1.z.string().min(1, "Rua é obrigatória."),
        number: zod_1.z.string().min(1, "Número é obrigatório."),
        district: zod_1.z.string().min(1, "Bairro é obrigatório."),
        city: zod_1.z.string().min(1, "Cidade é obrigatória."),
        state: zod_1.z.string().min(2, "Estado é obrigatório."),
        postalCode: zod_1.z.string().min(8, "CEP é obrigatório."),
    }),
});
