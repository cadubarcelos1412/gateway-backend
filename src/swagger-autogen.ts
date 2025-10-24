// src/swagger-autogen.ts
// Usa require() para evitar conflitos de exportação híbrida
const swaggerAutogen = require("swagger-autogen")({ openapi: "3.0.0" });

const doc = {
  info: {
    title: "Kissa Gateway API",
    description:
      "Documentação gerada automaticamente do **Gateway KissaPagamentos**.\n\n" +
      "Inclui rotas de autenticação, transações, carteiras, conciliação e administração.\n\n" +
      "Use o ambiente correto (produção ou local) e o token JWT quando necessário.",
    version: "1.0.0",
    contact: {
      name: "Equipe Kissa",
      email: "dev@kissapay.com",
    },
  },
  servers: [
    {
      url: "https://web-production-db663.up.railway.app/api",
      description: "🌐 Produção",
    },
    {
      url: "http://localhost:3000/api",
      description: "🧪 Desenvolvimento Local",
    },
  ],
  tags: [
    { name: "Auth", description: "Rotas de autenticação e usuários" },
    { name: "Transações", description: "Criação e consulta de transações" },
    { name: "Carteira", description: "Operações de saldo e cashout" },
    { name: "Sellers", description: "Cadastro e informações de sellers" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Insira o token JWT obtido no login",
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

const outputFile = "./swagger-output.json";
const endpointsFiles = ["./src/routes/index.ts"];

// 🚀 Gera o arquivo de documentação JSON automaticamente
swaggerAutogen(outputFile, endpointsFiles, doc);
