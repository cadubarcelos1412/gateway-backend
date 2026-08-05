// 🚀 Servidor principal da PYX Gate

import express, { Request, Response, ErrorRequestHandler } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { connectDB } from "./config/database";

import routes from "./routes";
import cashoutRoutes from "./routes/cashout.routes";
import v1Routes from "./routes/v1";
import docsRoutes from "./routes/docs.routes";
import { reconcilePendingZendryPix } from "./services/zendryReconciliation.service";

dotenv.config();
const app = express();

/* -------------------------------------------------------------------------- */
/* 🌍 Middlewares globais                                                    */
/* -------------------------------------------------------------------------- */
app.use(express.json());

// 🔒 Origens permitidas via env var (CSV) — sem ALLOWED_ORIGINS configurada,
// libera geral (dev). Em produção, defina ALLOWED_ORIGINS com o(s) domínio(s)
// reais do frontend (ex.: https://app.pyxgate.com).
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(helmet());

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/* -------------------------------------------------------------------------- */
/* 🩹 Handler para JSON malformado                                           */
/* -------------------------------------------------------------------------- */
const invalidJsonHandler: ErrorRequestHandler = (err, _req, res, next): void => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      status: false,
      msg: "❌ JSON malformado. Verifique aspas e vírgulas no corpo da requisição.",
    });
    return;
  }
  next(err);
};
app.use(invalidJsonHandler);

/* -------------------------------------------------------------------------- */
/* 🗄️ Conexão com o MongoDB                                                 */
/* -------------------------------------------------------------------------- */
connectDB()
  .then(() => {
    console.log("📦 Banco de dados conectado com sucesso!");

    // 🔁 Rede de segurança: webhook da Zendry não confirmado como chegando
    // nesta conta (ver zendryWebhook.controller.ts) — reconcilia Pix
    // "pending" há mais de alguns minutos consultando a Zendry direto.
    // A cada 10min; primeira rodada logo no boot, com atraso pra não brigar
    // com o próprio startup do processo.
    const runReconciliation = () => {
      reconcilePendingZendryPix()
        .then((r) => {
          if (r.updated > 0 || r.errors.length > 0) {
            console.log(`🔁 Reconciliação Zendry Pix: ${r.checked} verificadas, ${r.updated} atualizadas, ${r.errors.length} erros.`);
          }
        })
        .catch((err) => console.error("❌ Erro na reconciliação periódica de Pix:", err));
    };
    const TEN_MINUTES = 10 * 60 * 1000;
    setTimeout(() => {
      runReconciliation();
      setInterval(runReconciliation, TEN_MINUTES);
    }, 30_000);
  })
  .catch((err) => {
    console.error("❌ Erro ao conectar ao banco:", err);
    process.exit(1);
  });

/* -------------------------------------------------------------------------- */
/* 🛣️ Rotas principais da API                                               */
/* -------------------------------------------------------------------------- */
app.use("/api", routes); // rotas gerais (usuários, transações, etc.)
app.use("/api/cashouts", cashoutRoutes); // módulo de saques
app.use("/v1", v1Routes); // 🌐 API pública, autenticada por API key (sk_...)

// 📚 Docs navegáveis (site estático, sem dados sensíveis) — pública em qualquer ambiente.
app.use("/docs", docsRoutes);

/* -------------------------------------------------------------------------- */
/* 💓 Rota de Saúde                                                         */
/* -------------------------------------------------------------------------- */
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: true,
    msg: "🚀 PYX Gate rodando firme e forte!",
    baseUrl: process.env.BASE_URL || "não configurada",
    env: process.env.NODE_ENV || "desconhecido",
  });
});

/* -------------------------------------------------------------------------- */
/* ❌ 404 - Rota não encontrada                                              */
/* -------------------------------------------------------------------------- */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: false,
    msg: "Rota não encontrada. Verifique o endpoint.",
  });
});

/* -------------------------------------------------------------------------- */
/* 💥 Middleware Global de Erros                                            */
/* -------------------------------------------------------------------------- */
const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next): void => {
  console.error("💥 Erro global capturado:", err.message);
  if (process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  }

  res.status(err.status || 500).json({
    status: false,
    msg: err.message || "Erro interno no servidor.",
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });
};
app.use(globalErrorHandler);

/* -------------------------------------------------------------------------- */
/* 🚀 Inicialização do Servidor                                              */
/* -------------------------------------------------------------------------- */
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL =
  process.env.BASE_URL ||
  (process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL : `http://localhost:${PORT}`);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`🌍 API disponível em: ${BASE_URL}`);
});
