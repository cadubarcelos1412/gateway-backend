#!/usr/bin/env node
// MCP PYX Gate — servidor oficial.
//
// Dois modos:
//   npx @pyxgate/mcp --stdio    → local, autentica com PYXGATE_API_KEY (sk_...)
//   npx @pyxgate/mcp            → Streamable HTTP + OAuth 2.1 (modo hospedado)
//
// É um Resource Server OAuth 2.1: não valida token nenhum por conta própria
// (não tem, e não deve ter, o SECRET_TOKEN do gateway) — repassa o Bearer
// pra /v1, que é quem assina e confere. O papel dele aqui é (a) anunciar
// onde fica o Authorization Server, via /.well-known/oauth-protected-resource,
// e (b) devolver 401 com WWW-Authenticate pra disparar o fluxo no cliente.
import express from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const API_URL = (process.env.PYXGATE_API_URL || "https://pyxgate-api.onrender.com").replace(/\/$/, "");
const PORT = Number(process.env.PORT) || 3333;
/** Identificador deste recurso. Precisa bater EXATAMENTE com MCP_RESOURCE_URL no gateway. */
const RESOURCE = (process.env.MCP_PUBLIC_URL || `http://localhost:${PORT}/mcp`).replace(/\/$/, "");

/* -------------------------------------------------------------------------- */
/* 🌐 Cliente da API                                                          */
/* -------------------------------------------------------------------------- */

function bearerFrom(req) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7).trim() : undefined;
  return token || process.env.PYXGATE_API_KEY;
}

async function pyx(token, path, { method = "GET", body, idempotencyKey, query } = {}) {
  if (!token) throw new Error("Não autorizado: conecte a aplicação à sua conta PYX Gate.");

  const url = new URL(`${API_URL}/v1${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = json?.error?.code;
    let msg = json?.error?.message || `HTTP ${res.status} em ${path}`;
    if (res.status === 401) msg = `${msg} — a autorização expirou ou foi revogada; reconecte a aplicação.`;
    if (code === "insufficient_scope") msg = `${msg} (autorize novamente marcando a permissão que falta).`;
    throw new Error(msg);
  }
  return json;
}

const brl = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O qr_code_base64 devolvido pela API é um PNG 1x1 em modo teste, então a
 * imagem é sempre gerada aqui a partir do EMV (copia-e-cola) — mesmo caminho
 * em test e live, e o EMV é a fonte canônica dos dois jeitos.
 */
async function qrPng(emv) {
  const dataUrl = await QRCode.toDataURL(emv, { errorCorrectionLevel: "M", margin: 1, width: 512 });
  return dataUrl.split(",")[1];
}

const text = (t) => ({ content: [{ type: "text", text: t }] });

/** Toda tool passa por aqui: erro da API vira isError do MCP, não exceção de transporte. */
function tool(handler) {
  return async (args, extra) => {
    try {
      return await handler(args, extra);
    } catch (err) {
      return { ...text(`❌ ${err.message}`), isError: true };
    }
  };
}

/* -------------------------------------------------------------------------- */
/* 🛠️ Servidor MCP                                                           */
/* -------------------------------------------------------------------------- */

/** Só leitura: seguro de chamar sem confirmação do usuário. */
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
/** Escreve, mas não destrói nada existente. */
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

function buildServer(req) {
  const token = bearerFrom(req);
  const server = new McpServer(
    { name: "pyxgate", version: "1.0.0" },
    {
      instructions:
        "Ferramentas da PYX Gate (gateway de pagamentos brasileiro). Valores SEMPRE em centavos " +
        "(1990 = R$ 19,90). O ambiente (teste ou produção) é uma propriedade da autorização, " +
        "não um parâmetro — verifique com consultar_conta antes de criar cobranças. " +
        "Em produção, cada cobrança criada é real: confirme o valor com o usuário antes.",
    }
  );

  /* ---------------------------- Pagamentos ------------------------------- */

  server.registerTool(
    "criar_cobranca_pix",
    {
      title: "Criar cobrança Pix",
      description:
        "Cria uma cobrança Pix e devolve o QR Code como imagem + o código copia-e-cola. " +
        "Em modo produção isso gera uma cobrança real. Valor mínimo: 500 centavos (R$ 5,00).",
      annotations: WRITE,
      inputSchema: {
        valor_centavos: z.number().int().min(500).describe("Valor em centavos. 1990 = R$ 19,90. Mínimo 500."),
        nome: z.string().min(3).describe("Nome do comprador"),
        email: z.string().email().optional().describe("Obrigatório junto com documento, salvo conta liberada para telefone"),
        documento: z.string().optional().describe("CPF (11 dígitos) ou CNPJ (14), só números"),
        telefone: z.string().optional().describe("Alternativa a email+documento, se a conta tiver liberação"),
        descricao: z.string().optional(),
        pedido_id: z.string().optional().describe("Seu id de pedido: vira metadata.order_id e Idempotency-Key"),
      },
    },
    tool(async (a) => {
      const p = await pyx(token, "/payments", {
        method: "POST",
        idempotencyKey: a.pedido_id,
        body: {
          amount: a.valor_centavos,
          payment_method: "pix",
          description: a.descricao,
          customer: { name: a.nome, email: a.email, document: a.documento, phone: a.telefone },
          metadata: a.pedido_id ? { order_id: a.pedido_id } : undefined,
        },
      });
      if (!p.qr_code) throw new Error(`Cobrança ${p.id} criada sem QR Code (status ${p.status}).`);
      return {
        content: [
          {
            type: "text",
            text:
              `Cobrança ${p.id} criada — ${brl(p.amount)} — status ${p.status} — modo ${p.mode}.` +
              (p.mode === "test" ? "\n⚠️ Modo teste: este QR não é pagável de verdade." : "") +
              `\n\nPix copia e cola:\n${p.qr_code}`,
          },
          { type: "image", mimeType: "image/png", data: await qrPng(p.qr_code) },
        ],
        structuredContent: { id: p.id, status: p.status, mode: p.mode, amount: p.amount, qr_code: p.qr_code },
      };
    })
  );

  server.registerTool(
    "consultar_pagamento",
    {
      title: "Consultar pagamento",
      description: "Status atual de um pagamento pelo id público (pay_...). Consulta a adquirente ao vivo se ainda estiver pendente.",
      annotations: READ,
      inputSchema: { id: z.string().describe("id público, ex.: pay_6a714eb5b03f4c85d1b52f39") },
    },
    tool(async ({ id }) => {
      const p = await pyx(token, `/payments/${id}`);
      return {
        ...text(
          `${p.id}: ${p.status} — ${brl(p.amount)} (taxa ${brl(p.fee)}, líquido ${brl(p.net_amount)}), ` +
            `método ${p.payment_method}, modo ${p.mode}.`
        ),
        structuredContent: { id: p.id, status: p.status, mode: p.mode, amount: p.amount, net_amount: p.net_amount },
      };
    })
  );

  server.registerTool(
    "listar_pagamentos",
    {
      title: "Listar pagamentos",
      description: "Lista pagamentos com filtro de status e período. Escopado ao ambiente da autorização.",
      annotations: READ,
      inputSchema: {
        status: z.enum(["pending", "paid", "failed", "refunded"]).optional(),
        criados_apos: z.string().optional().describe("Data ISO 8601, ex.: 2026-09-01"),
        criados_antes: z.string().optional().describe("Data ISO 8601"),
        limite: z.number().int().min(1).max(100).default(20),
        pagina: z.number().int().min(1).default(1),
      },
    },
    tool(async (a) => {
      const r = await pyx(token, "/payments", {
        query: { status: a.status, created_after: a.criados_apos, created_before: a.criados_antes, limit: a.limite, page: a.pagina },
      });
      const linhas = r.data.map((p) => `- ${p.id} · ${p.status} · ${brl(p.amount)} · ${new Date(p.created * 1000).toLocaleDateString("pt-BR")}`);
      return {
        ...text(
          r.total === 0
            ? "Nenhum pagamento encontrado com esses filtros."
            : `${r.total} pagamento(s), página ${r.page}:\n${linhas.join("\n")}` + (r.has_more ? "\n\n(há mais páginas)" : "")
        ),
        structuredContent: { total: r.total, page: r.page, has_more: r.has_more, data: r.data },
      };
    })
  );

  server.registerTool(
    "consultar_conta",
    {
      title: "Consultar conta",
      description: "Dados do merchant autorizado e — importante — se a sessão está em modo teste ou produção.",
      annotations: READ,
      inputSchema: {},
    },
    tool(async () => {
      const a = await pyx(token, "/account");
      return { ...text(`Conta: ${JSON.stringify(a, null, 2)}`), structuredContent: a };
    })
  );

  server.registerTool(
    "simular_pagamento",
    {
      title: "Simular pagamento (modo teste)",
      description: "Marca uma cobrança de teste como paga ou falha, disparando o webhook. Não funciona em produção.",
      annotations: WRITE,
      inputSchema: {
        id: z.string().describe("id público da cobrança de teste"),
        resultado: z.enum(["pago", "falha"]).default("pago"),
      },
    },
    tool(async ({ id, resultado }) => {
      const p = await pyx(token, `/test/payments/${id}/${resultado === "pago" ? "pay" : "fail"}`, { method: "POST" });
      return text(`${id} agora está "${p.status ?? (resultado === "pago" ? "paid" : "failed")}". O webhook correspondente foi disparado.`);
    })
  );

  /* ---------------------------- Webhooks ---------------------------------- */

  server.registerTool(
    "listar_webhooks",
    {
      title: "Listar endpoints de webhook",
      description: "Endpoints cadastrados para receber eventos, com os eventos assinados por cada um.",
      annotations: READ,
      inputSchema: {},
    },
    tool(async () => {
      const r = await pyx(token, "/webhook_endpoints");
      const itens = r.data ?? r;
      if (!itens?.length) return text("Nenhum endpoint de webhook cadastrado.");
      return {
        ...text(itens.map((w) => `- ${w.id} · ${w.url} · [${(w.events ?? []).join(", ")}] · ${w.active === false ? "inativo" : "ativo"}`).join("\n")),
        structuredContent: { data: itens },
      };
    })
  );

  server.registerTool(
    "criar_webhook",
    {
      title: "Cadastrar endpoint de webhook",
      description: "Cadastra uma URL https para receber eventos assinados (HMAC). Devolve o secret de assinatura uma única vez.",
      annotations: WRITE,
      inputSchema: {
        url: z.string().url().describe("URL https do seu endpoint"),
        eventos: z.array(z.string()).min(1).describe('Ex.: ["payment.paid", "payment.failed"]'),
      },
    },
    tool(async ({ url, eventos }) => {
      const w = await pyx(token, "/webhook_endpoints", { method: "POST", body: { url, events: eventos } });
      return {
        ...text(`Endpoint ${w.id} criado para ${w.url}.${w.secret ? `\n\n🔑 Secret de assinatura (guarde agora, só aparece uma vez):\n${w.secret}` : ""}`),
        structuredContent: w,
      };
    })
  );

  server.registerTool(
    "atualizar_webhook",
    {
      title: "Atualizar endpoint de webhook",
      description: "Altera a URL, os eventos assinados ou ativa/desativa um endpoint.",
      annotations: WRITE,
      inputSchema: {
        id: z.string(),
        url: z.string().url().optional(),
        eventos: z.array(z.string()).optional(),
        ativo: z.boolean().optional(),
      },
    },
    tool(async ({ id, url, eventos, ativo }) => {
      const w = await pyx(token, `/webhook_endpoints/${id}`, {
        method: "PATCH",
        body: { url, events: eventos, active: ativo },
      });
      return { ...text(`Endpoint ${id} atualizado.`), structuredContent: w };
    })
  );

  server.registerTool(
    "remover_webhook",
    {
      title: "Remover endpoint de webhook",
      description: "Remove um endpoint. Depois disso ele para de receber eventos — não é reversível.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: { id: z.string() },
    },
    tool(async ({ id }) => {
      await pyx(token, `/webhook_endpoints/${id}`, { method: "DELETE" });
      return text(`Endpoint ${id} removido.`);
    })
  );

  // Cartão não vira tool de propósito: POST /v1/payments com payment_method
  // "card" exige threeds_data, que só existe depois do desafio 3DS rodar no
  // NAVEGADOR do comprador (ver docs/guia-cartao.md). Um agente não tem como
  // produzir esse dado, e uma tool que sempre falha é pior que tool nenhuma.

  /* ------------------------- Skills (prompts) ----------------------------- */

  server.registerPrompt(
    "integrar_checkout_pix",
    {
      title: "Integrar checkout Pix",
      description: "Roteiro completo para plugar Pix da PYX Gate num e-commerce, do QR até liberar o pedido.",
      argsSchema: {
        stack: z.string().describe("Stack do integrador, ex.: 'Next.js + Prisma', 'Laravel', 'WooCommerce'"),
      },
    },
    ({ stack }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Quero integrar pagamento via Pix da PYX Gate em ${stack}. Conduza assim:\n\n` +
              `1. Rode consultar_conta e me diga em que ambiente estamos (teste/produção). Se for produção, pare e confirme comigo antes de qualquer criação.\n` +
              `2. Crie uma cobrança de teste com criar_cobranca_pix (R$ 19,90) e me mostre o QR.\n` +
              `3. Cadastre um webhook com criar_webhook para payment.paid e payment.failed, e guarde o secret.\n` +
              `4. Escreva o handler do webhook em ${stack}, incluindo a verificação HMAC da assinatura e o tratamento de reentrega (o mesmo evento pode chegar duas vezes — trate por idempotência no meu lado).\n` +
              `5. Rode simular_pagamento no id criado e confirme com consultar_pagamento que virou "paid".\n` +
              `6. Escreva o código de criação da cobrança em ${stack}, sempre com Idempotency-Key = id do pedido, e com os valores em centavos.\n\n` +
              `Regras: valores sempre em centavos; nunca coloque a credencial no frontend; trate o status "pending" como "ainda não pago" e libere o pedido só no webhook payment.paid.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "diagnosticar_pagamento",
    {
      title: "Diagnosticar pagamento",
      description: "Investiga uma cobrança que não confirmou e diz o que fazer.",
      argsSchema: { payment_id: z.string().describe("id público, ex.: pay_6a71...") },
    },
    ({ payment_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `A cobrança ${payment_id} não confirmou. Diagnostique:\n\n` +
              `1. consultar_pagamento em ${payment_id} — status, método, modo, valor.\n` +
              `2. Se estiver "pending": em modo teste, confirmação é manual (simular_pagamento) — diga isso claramente. Em produção, a confirmação leva de 5 a 13 minutos após o pagamento real, porque a reconciliação com a adquirente roda a cada 30s e nem todo webhook chega na primeira tentativa.\n` +
              `3. listar_webhooks — confirme que existe endpoint ativo assinando payment.paid. Se não existir, essa é a causa de "paguei e meu sistema não soube".\n` +
              `4. listar_pagamentos com o mesmo período — veja se houve cobrança duplicada (sintoma de integração sem Idempotency-Key).\n\n` +
              `Termine com um diagnóstico em uma frase e a ação concreta a tomar.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "checklist_producao",
    {
      title: "Checklist de produção",
      description: "Confere se a integração está pronta para sair do modo teste.",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Faça o checklist de pré-produção da minha integração PYX Gate:\n\n` +
              `1. consultar_conta — ambiente atual e status de KYC (sem KYC aprovado, produção não processa).\n` +
              `2. listar_webhooks — existe endpoint https ativo? Cobre payment.paid, payment.failed, payment.refunded e payment.chargedback?\n` +
              `3. listar_pagamentos status=paid — houve ao menos um fluxo completo em teste?\n` +
              `4. Me pergunte e verifique comigo: (a) a verificação de assinatura HMAC está implementada no meu handler? (b) uso Idempotency-Key em toda criação? (c) minha credencial de produção está fora do frontend e fora do repositório? (d) trato reentrega do mesmo evento sem liberar o pedido duas vezes?\n\n` +
              `Liste o que falta em ordem de risco. Não diga que está pronto se algum item acima não foi confirmado.`,
          },
        },
      ],
    })
  );

  return server;
}

/* -------------------------------------------------------------------------- */
/* 🚏 HTTP                                                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* 🖥️  Modo stdio — servidor local, chave sk_ do próprio dev                  */
/* -------------------------------------------------------------------------- */

if (process.argv.includes("--stdio")) {
  if (!process.env.PYXGATE_API_KEY?.startsWith("sk_")) {
    // stderr, não stdout: no stdio o stdout é o canal do protocolo.
    console.error("PYXGATE_API_KEY (sk_test_... ou sk_live_...) é obrigatória no modo --stdio.");
    process.exit(1);
  }
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  // Sem requisição HTTP aqui: o token vem só da env (ver bearerFrom).
  const server = buildServer({ headers: {} });
  await server.connect(new StdioServerTransport());
} else {

/* -------------------------------------------------------------------------- */
/* 🌐 Modo HTTP — hospedado, OAuth 2.1                                        */
/* -------------------------------------------------------------------------- */

const app = express();
app.use(express.json());

// CORS mínimo pra cliente MCP em navegador. Mcp-Session-Id precisa estar
// exposto senão o cliente não consegue ler o header de sessão.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version");
  res.header("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/**
 * RFC 9728 — é por aqui que o cliente MCP descobre sozinho qual é o
 * Authorization Server e sai pro fluxo de consentimento.
 */
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: RESOURCE,
    authorization_servers: [API_URL],
    scopes_supported: ["account:read", "payments:read", "payments:write", "webhooks:read", "webhooks:write", "test:write"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${API_URL}/docs#mcp`,
  });
});

app.post("/mcp", async (req, res) => {
  if (!bearerFrom(req)) {
    // O WWW-Authenticate é o que dispara o OAuth no cliente — sem ele, o
    // cliente só vê um 401 opaco e não sabe pra onde ir.
    res
      .status(401)
      .header("WWW-Authenticate", `Bearer resource_metadata="${RESOURCE.replace(/\/mcp$/, "")}/.well-known/oauth-protected-resource"`)
      .json({ jsonrpc: "2.0", error: { code: -32001, message: "Não autorizado. Conecte esta aplicação à sua conta PYX Gate." }, id: null });
    return;
  }

  // Stateless: um server + transporte por requisição, fechados no fim.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  const server = buildServer(req);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Sem sessão não há stream do servidor pro cliente nem sessão pra encerrar.
const noSession = (_req, res) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
app.get("/mcp", noSession);
app.delete("/mcp", noSession);

app.get("/health", (_req, res) => res.json({ ok: true, resource: RESOURCE, api: `${API_URL}/v1` }));

app.listen(PORT, () => {
  console.log(`MCP PYX Gate em http://localhost:${PORT}/mcp`);
  console.log(`  recurso (aud): ${RESOURCE}`);
  console.log(`  API / auth server: ${API_URL}`);
});

}
