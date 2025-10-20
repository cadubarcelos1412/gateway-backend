import express, { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { connectDB } from "./config/database";
import routes from "./routes";

dotenv.config();
const app = express();

/* -------------------------------------------------------------------------- */
/* 🛠️ Middlewares Globais – ORDEM IMPORTA! */
/* -------------------------------------------------------------------------- */
app.use(express.json()); // ✅ TEM que vir primeiro de tudo
app.use(cors({
  origin: "*", // ⚠️ Em produção, troque pelo domínio real
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(helmet());

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/* -------------------------------------------------------------------------- */
/* 🩹 Captura JSON malformado – precisa vir depois do express.json() */
/* -------------------------------------------------------------------------- */
const invalidJsonHandler: ErrorRequestHandler = (err, _req, res, next): void => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      status: false,
      msg: "❌ JSON malformado. Verifique aspas, vírgulas e acentos no corpo da requisição.",
    });
    return;
  }
  next(err);
};

app.use(invalidJsonHandler);

/* -------------------------------------------------------------------------- */
/* 🗄️ Conexão com o Banco de Dados */
/* -------------------------------------------------------------------------- */
connectDB()
  .then(() => console.log("📦 Banco de dados conectado com sucesso!"))
  .catch((err) => {
    console.error("❌ Erro ao conectar ao banco:", err);
    process.exit(1);
  });

/* -------------------------------------------------------------------------- */
/* 🛣️ Rotas da API */
/* -------------------------------------------------------------------------- */
app.use("/api", routes);

/* -------------------------------------------------------------------------- */
/* 🩺 Rota de Saúde */
/* -------------------------------------------------------------------------- */
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: true,
    msg: "🚀 API do Gateway rodando com sucesso!",
  });
});

/* -------------------------------------------------------------------------- */
/* ❌ 404 - Rota não encontrada */
/* -------------------------------------------------------------------------- */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: false,
    msg: "Rota não encontrada. Verifique o endpoint.",
  });
});

/* -------------------------------------------------------------------------- */
/* 💥 Middleware Global de Erros */
/* -------------------------------------------------------------------------- */
const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next): void => {
  console.error("💥 Erro global capturado:", err.message);
  if (process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  }

  res.status(err.status || 500).json({
    status: false,
    msg: err.message || "Erro interno no servidor. Tente novamente mais tarde.",
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });
};

app.use(globalErrorHandler);

/* -------------------------------------------------------------------------- */
/* 🚀 Inicialização do Servidor */
/* -------------------------------------------------------------------------- */
const PORT: number = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`🌍 API disponível em: http://localhost:${PORT}`);
});
