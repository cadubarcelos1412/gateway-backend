"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSwagger = void 0;
// src/swagger.ts
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
// 📘 Configurações do Swagger
const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Kissa Gateway API",
            version: "1.0.0",
            description: "📄 Documentação oficial da API do gateway **Kissa Pagamentos**.\n\n" +
                "Inclui rotas de transações, sellers, carteiras, conciliação e endpoints administrativos.\n\n" +
                "⚠️ Use o ambiente correto conforme descrito abaixo.",
            contact: {
                name: "Equipe Kissa",
                email: "dev@kissapay.com",
            },
        },
        servers: [
            {
                url: "https://web-production-db663.up.railway.app/api",
                description: "🌐 Servidor de Produção",
            },
            {
                url: "http://localhost:3000/api",
                description: "🧪 Servidor Local (Desenvolvimento)",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    description: "Insira o token JWT obtido no login.",
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: ["./src/routes/**/*.ts", "./src/controllers/**/*.ts"],
};
// 🧾 Gera a especificação OpenAPI
const swaggerSpec = (0, swagger_jsdoc_1.default)(options);
// 🚀 Função que integra o Swagger ao Express
const setupSwagger = (app) => {
    app.use("/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerSpec, {
        explorer: true,
        customCss: `
        .swagger-ui .topbar { display: none }
        body { background-color: #0c0c0c; color: #fff; }
      `,
        customSiteTitle: "Kissa Gateway API Docs",
    }));
    console.log("📘 Documentação Swagger disponível em: /docs");
};
exports.setupSwagger = setupSwagger;
