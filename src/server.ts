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
import oauthRoutes, { wellKnownRouter } from "./routes/oauth.routes";
import installRoutes from "./routes/install.routes";
import { reconcilePendingZendryPix } from "./services/zendryReconciliation.service";
import { releaseAllMaturedWallets } from "./services/wallet.service";
import { reconcilePixPayoutStatuses } from "./services/pixPayoutReconciliation.service";
import { revokeMaturedSplitRules } from "./services/splitRule.service";
import { reconcilePendingSttartPix } from "./services/sttartReconciliation.service";

dotenv.config();

// 🛡️ Rede de segurança — um erro não tratado (ex.: CastError de
// User.findById com um id que não é ObjectId válido) derrubaria o processo
// Node inteiro (comportamento padrão desde o Node 15), tirando a API do ar
// pra TODOS os sellers por causa de UMA requisição malformada. Isso já
// aconteceu na prática (ver requireMasterUser em master.controller.ts).
// Só loga e segue — não é solução pros bugs em si (cada um deveria ter seu
// próprio try/catch), é a última linha de defesa pra eles não derrubarem o
// servidor inteiro enquanto não são corrigidos um a um.
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
});

const app = express();

/* -------------------------------------------------------------------------- */
/* 🌍 Middlewares globais                                                    */
/* -------------------------------------------------------------------------- */
// `verify` guarda os bytes crus do corpo em req.rawBody, sem mudar o
// parsing normal pra ninguém — necessário pra validar assinatura HMAC de
// webhook (Zendry, painel novo): recalcular a assinatura em cima de
// JSON.stringify(req.body) não bate byte a byte com o que foi assinado
// originalmente (ordem de chave, espaçamento etc. podem diferir).
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// 🔒 Origens permitidas via env var (CSV). Em desenvolvimento, sem
// ALLOWED_ORIGINS configurada, libera geral (conveniência local). Em
// PRODUÇÃO, falha FECHADO se a variável não estiver setada — achado de
// auditoria de segurança (2026-08-30): antes, produção sem essa env var
// configurada refletia qualquer Origin (`origin: true`), permitindo que
// qualquer site fizesse requisição autenticada contra a API caso um token
// vazasse pro navegador errado. Configure ALLOWED_ORIGINS com o(s)
// domínio(s) reais do frontend (ex.: https://www.pyxgate.com) no Render.
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean);
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && (!allowedOrigins || allowedOrigins.length === 0)) {
  console.error("❌ ALLOWED_ORIGINS não configurada em produção — CORS vai bloquear todas as origens até isso ser corrigido.");
}
app.use(
  cors({
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : !isProduction,
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
    // "pending" consultando a Zendry direto. Medido em produção em
    // 2026-08-13 (10 confirmações reais da Ocampo Store): TODAS levaram
    // 320-783s pra confirmar, mesmo as que o integrador registrou como
    // pegas por polling ativo do lado dele — ou seja, esse loop (não o
    // webhook da Zendry pra nós, que segue não confirmado, nem o polling do
    // integrador) é o caminho que está realmente resolvendo essas
    // confirmações hoje, e o intervalo dele é o teto real de espera do
    // cliente final. Reduzido de 90s pra 30s por isso. Primeira rodada logo
    // no boot, com atraso pra não brigar com o próprio startup do processo.
    const runReconciliation = () => {
      reconcilePendingZendryPix()
        .then((r) => {
          if (r.updated > 0 || r.errors.length > 0) {
            console.log(`🔁 Reconciliação Zendry Pix: ${r.checked} verificadas, ${r.updated} atualizadas, ${r.errors.length} erros.`);
          }
        })
        .catch((err) => console.error("❌ Erro na reconciliação periódica de Pix:", err));
    };
    const RECONCILIATION_INTERVAL = 30 * 1000;
    setTimeout(() => {
      runReconciliation();
      setInterval(runReconciliation, RECONCILIATION_INTERVAL);
    }, 30_000);

    // 🔁 Rede de segurança: até 2026-08-09, o único jeito de mover saldo de
    // "reservado" (unAvailable) pra "disponível" quando o prazo vencia era
    // um endpoint manual (POST /api/release/manual) que NADA no sistema
    // chamava — dinheiro já maduro (inclusive Pix D+0, que nunca deveria
    // ficar preso) ficava exibido como bloqueado indefinidamente. Agora
    // getMyWallet e a criação de cashout já liberam na hora em que são
    // chamados (ver wallet.service.ts); esta varredura é só backup pra
    // carteiras que ninguém consultou nesse meio-tempo. A cada 5min.
    const runWalletRelease = () => {
      releaseAllMaturedWallets()
        .then((r) => {
          if (r.walletsReleased > 0) {
            console.log(`🔓 Liberação de saldo: ${r.walletsChecked} carteiras verificadas, ${r.walletsReleased} liberadas, R$ ${r.totalReleased.toFixed(2)} no total.`);
          }
        })
        .catch((err) => console.error("❌ Erro na liberação periódica de saldo:", err));
    };
    const FIVE_MINUTES = 5 * 60 * 1000;
    setTimeout(() => {
      runWalletRelease();
      setInterval(runWalletRelease, FIVE_MINUTES);
    }, 30_000);

    // 🔁 Rede de segurança pro saque em Pix (envio) — mesma desconfiança do
    // webhook que já vale pro resto da Zendry (ver comentário no service).
    // Só atualiza providerStatus pra exibição/auditoria no painel master.
    const runPixPayoutReconciliation = () => {
      reconcilePixPayoutStatuses()
        .then((r) => {
          if (r.updated > 0) {
            console.log(`🔁 Reconciliação de saques PIX: ${r.checked} verificados, ${r.updated} atualizados.`);
          }
        })
        .catch((err) => console.error("❌ Erro na reconciliação periódica de saques PIX:", err));
    };
    const TEN_MINUTES = 10 * 60 * 1000;
    setTimeout(() => {
      runPixPayoutReconciliation();
      setInterval(runPixPayoutReconciliation, TEN_MINUTES);
    }, 30_000);

    // 🔁 Rede de segurança pro lado Sttart (cash-in) — mesma desconfiança de
    // webhook que já vale pro resto da integração (ver
    // sttartReconciliation.service.ts). Reaproveita o intervalo de 10min já
    // usado pro reconciliador de saques Pix.
    const runSttartReconciliation = () => {
      reconcilePendingSttartPix()
        .then((r) => {
          if (r.updated > 0 || r.errors.length > 0) {
            console.log(`🔁 Reconciliação Sttart Pix: ${r.checked} verificadas, ${r.updated} atualizadas, ${r.errors.length} erros.`);
          }
        })
        .catch((err) => console.error("❌ Erro na reconciliação periódica de Pix (Sttart):", err));
    };
    setTimeout(() => {
      runSttartReconciliation();
      setInterval(runSttartReconciliation, TEN_MINUTES);
    }, 30_000);

    // 🤝 Fecha de vez parcerias cuja carência de revogação já passou (ver
    // revokeSplitRule em seller.controller.ts) — o pagamento de split em si
    // já tem um filtro defensivo próprio em transaction.service.ts, isso
    // aqui só mantém o status "revoked" refletido pra exibição.
    const runSplitRuleSweep = () => {
      revokeMaturedSplitRules()
        .then((r) => {
          if (r.revoked > 0) {
            console.log(`🤝 Parcerias revogadas por carência vencida: ${r.revoked}.`);
          }
        })
        .catch((err) => console.error("❌ Erro no sweep de revogação de parcerias:", err));
    };
    setTimeout(() => {
      runSplitRuleSweep();
      setInterval(runSplitRuleSweep, TEN_MINUTES);
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
app.use("/v1", v1Routes); // 🌐 API pública: chave sk_... ou access token OAuth

// 🔓 OAuth 2.1 — Authorization Server usado pelo servidor MCP e por apps de
// terceiros que agem em nome do seller. Os documentos .well-known precisam
// ficar na RAIZ do domínio (RFC 8414 / RFC 9728): é lá que o cliente procura.
app.use("/oauth", oauthRoutes);
app.use("/.well-known", wellKnownRouter);

// 🚚 Canal de instalação próprio (curl | sh) — serve os tarballs assinados
// por SHA-256 direto daqui, sem depender de registry público.
app.use("/", installRoutes);

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
