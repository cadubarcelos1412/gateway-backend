// src/swagger.ts
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

// ✳️ Define tipo leve pro options (corrige TS2694)
interface SwaggerOptions {
  definition: Record<string, any>;
  apis: string[];
}

// 📘 Configurações do Swagger
const options: SwaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Kissa Gateway API",
      version: "1.0.0",
      description:
        "📄 Documentação oficial da API do gateway **Kissa Pagamentos**.\n\n" +
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
const swaggerSpec = swaggerJSDoc(options);

// 🚀 Função que integra o Swagger ao Express
export const setupSwagger = (app: Express): void => {
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: `
        .swagger-ui .topbar { display: none }
        body { background-color: #0c0c0c; color: #fff; }
      `,
      customSiteTitle: "Kissa Gateway API Docs",
    })
  );

  console.log("📘 Documentação Swagger disponível em: /docs");
};
