import { Request, Response, NextFunction } from "express";
import { Transaction } from "../models/transaction.model";
import { User } from "../models/user.model";
import { Seller } from "../models/seller.model";
import { createToken, decodeToken } from "../config/auth";
import { ACQUIRER_KEYS, resolveSellerAcquirer } from "../acquirers";
import { getOrCreateDefaultFeeConfig, SystemFeeConfig } from "../models/systemFeeConfig.model";
import { SplitRule } from "../models/splitRule.model";
import { reconcilePendingZendryPix } from "../services/zendryReconciliation.service";
import { brazilDayBounds, brazilMonthBounds } from "../utils/timezone";
import { recordManualRefund, recordChargeback, recordPartialCancellation } from "../services/paymentReversal.service";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  isValidEventList,
  createPlatformWebhookEndpoint,
  listPlatformWebhookEndpoints,
  updatePlatformWebhookEndpoint,
  deletePlatformWebhookEndpoint,
  isValidPlatformEventList,
} from "../services/webhookEndpoint.service";

/**
 * 🔑 Utilitário — pegar usuário autenticado pelo token e exigir role master.
 *
 * Envolto em try/catch: payload.id pode não ser um ObjectId válido (ex.: o
 * token de bootstrap gerado por generateMasterToken usa id: "master", uma
 * string literal) — sem isso, User.findById lança um CastError que nunca é
 * capturado (a função é chamada fora de qualquer try/catch nos callers) e
 * derruba o processo Node inteiro, tirando a API do ar pra TODOS os sellers,
 * não só quem fez a requisição inválida.
 */
const requireMasterUser = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ status: false, msg: "Token ausente." });
      return null;
    }
    const payload = await decodeToken(token);
    if (!payload?.id) {
      res.status(401).json({ status: false, msg: "Token inválido." });
      return null;
    }
    const user = await User.findById(payload.id);
    if (!user || user.role !== "master") {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas master." });
      return null;
    }
    return user;
  } catch (error) {
    console.error("❌ Erro em requireMasterUser:", error);
    res.status(401).json({ status: false, msg: "Token inválido." });
    return null;
  }
};

/**
 * 🛡️ Versão middleware de requireMasterUser, pra usar direto na rota.
 *
 * Necessário pra rotas com cacheMiddleware (ex.: /kpas, /top-products):
 * o cache roda ANTES do controller e serve a resposta cacheada pra
 * qualquer um, sem checar nada — se a auth só existisse dentro do
 * controller, uma vez o cache aquecido, requisições sem token nenhum
 * continuariam recebendo os dados normalmente. Rodando a auth como
 * middleware antes do cache, requisição não autenticada nunca chega
 * nem a bater no cache.
 */
export const requireMasterMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;
  next();
};

/**
 * 🔐 Gera token master (via SECRET_TOKEN do .env)
 */
export const generateMasterToken = async (req: Request, res: Response): Promise<void> => {
  const { auth } = req.body;

  if (!auth || auth !== process.env.SECRET_TOKEN) {
    res.status(403).json({ status: false, msg: "Token secreto inválido." });
    return;
  }

  const token = await createToken({ id: "master", role: "master" });

  res.status(200).json({ status: true, token });
};

/**
 * ✅ Valida token master (apenas para debug ou testes)
 */
export const validateMasterToken = async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body;
  const payload = await decodeToken(token);

  const isValid = payload?.role === "master";

  res.status(200).json({ status: isValid });
};

/**
 * 📊 Retorna métricas gerais da plataforma
 */
/**
 * Reescrito em 2026-08-30 — a versão anterior carregava a coleção INTEIRA de
 * Transaction e de User pra memória (Transaction.find().lean() sem filtro de
 * data nem paginação) e somava tudo em JavaScript, TODA VEZ que essa rota era
 * chamada. Como DashboardMasterHome.tsx repete essa chamada sozinho a cada 5s
 * enquanto a tela está aberta, isso significava reler o histórico completo de
 * transações do zero a cada 5 segundos — funciona sem ninguém notar com
 * poucas linhas na coleção, mas fica linearmente mais pesado conforme o
 * negócio cresce (achado numa auditoria de performance, 2026-08-30).
 *
 * Agora a soma acontece dentro do próprio MongoDB (agregação com $facet, um
 * único round-trip) — só os totais já calculados trafegam pela rede, nunca o
 * histórico inteiro. `status:1,createdAt:-1` (transaction.model.ts) e
 * `createdAt:-1` (user.model.ts) foram adicionados especificamente pra essas
 * consultas, que filtram por status/data SEM userId — os índices antigos
 * (todos começando por userId) não serviam pra elas.
 */
export const getKpas = async (_req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date();
    const { start: todayStart, end: todayEnd } = brazilDayBounds(today);
    const { start: monthStart, end: monthEnd } = brazilMonthBounds(today);

    // 📦 Repasse de parceria (metadata.source: "partner_split") fica de fora
    // do $match inicial — é o MESMO dinheiro da venda original já contado,
    // incluir aqui contaria o volume da plataforma em dobro.
    const baseMatch = { "metadata.source": { $ne: "partner_split" } };

    const [facetResult, totalUsuarios, usuariosHoje] = await Promise.all([
      Transaction.aggregate([
        { $match: baseMatch },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            approvedTotals: [
              { $match: { status: "approved" } },
              { $group: { _id: null, volumeTotal: { $sum: "$amount" }, totalTaxas: { $sum: "$fee" }, approvedCount: { $sum: 1 } } },
            ],
            approvedHoje: [
              { $match: { status: "approved", createdAt: { $gte: todayStart, $lt: todayEnd } } },
              { $group: { _id: null, volumeHoje: { $sum: "$amount" } } },
            ],
            approvedMes: [
              { $match: { status: "approved", createdAt: { $gte: monthStart, $lt: monthEnd } } },
              { $group: { _id: null, taxasMensais: { $sum: "$fee" } } },
            ],
            volumePorMetodo: [
              { $match: { status: "approved" } },
              { $group: { _id: "$method", total: { $sum: "$amount" } } },
            ],
          },
        },
      ]),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: todayStart, $lt: todayEnd } }),
    ]);

    const facet = facetResult[0];
    const totalCount: number = facet.totalCount[0]?.count ?? 0;
    const { volumeTotal = 0, totalTaxas = 0, approvedCount = 0 } = facet.approvedTotals[0] ?? {};
    const { volumeHoje = 0 } = facet.approvedHoje[0] ?? {};
    const { taxasMensais = 0 } = facet.approvedMes[0] ?? {};

    // Taxa de conversão é a única métrica aqui que precisa do TOTAL de
    // tentativas no denominador, por definição (aprovadas / todas).
    const taxaConversao = totalCount > 0 ? (approvedCount / totalCount) * 100 : 0;
    const ticketMedio = approvedCount > 0 ? volumeTotal / approvedCount : 0;

    const volumePorMetodo = (facet.volumePorMetodo as { _id: string | null; total: number }[]).reduce<Record<string, number>>(
      (acc, row) => {
        if (!row._id) return acc;
        acc[row._id] = row.total;
        return acc;
      },
      {}
    );

    // 📤 Resposta final
    res.status(200).json({
      status: true,
      metrics: {
        volumeTotal,
        volumeHoje,
        totalUsuarios,
        usuariosHoje,
        totalTaxas,
        taxasMensais,
        taxaConversao: `${taxaConversao.toFixed(2)}%`,
        ticketMedio: Number(ticketMedio.toFixed(2)),
        volumePorMetodo,
      },
    });
  } catch (error) {
    console.error("❌ Erro em getKpas:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao calcular KPIs." });
  }
};

/**
 * 📊 POST /api/master/analytics
 * Receita diária (por status), top sellers, comparação mensal e métricas
 * gerais do período. Endpoint nunca existiu antes — a página Analytics do
 * painel Master chamava um endpoint fantasma e sempre caía no "sem dados".
 */
export const getAnalytics = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;

  try {
    const period = (req.body?.period as string) || "30days";
    const days = period === "7days" ? 7 : period === "90days" ? 90 : period === "year" ? 365 : 30;

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const transactions = await Transaction.find({
      type: "deposit",
      createdAt: { $gte: since },
      "metadata.source": { $ne: "partner_split" }, // mesmo dinheiro da venda original — não contar em dobro
    }).lean();

    // 📅 Receita diária — bucket por dia, separado por status (aprovado/pendente/falhou)
    const dayMap = new Map<string, { revenue: number; pending: number; failed: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), { revenue: 0, pending: 0, failed: 0 });
    }
    for (const t of transactions) {
      if (!t.createdAt) continue;
      const key = new Date(t.createdAt).toISOString().slice(0, 10);
      const bucket = dayMap.get(key);
      if (!bucket) continue;
      if (t.status === "approved") bucket.revenue += t.amount || 0;
      else if (t.status === "pending") bucket.pending += t.amount || 0;
      else if (t.status === "failed") bucket.failed += t.amount || 0;
    }
    const dailyRevenue = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));

    // 🏆 Top sellers do período — só vendas aprovadas contam
    const approvedTx = transactions.filter((t) => t.status === "approved");
    const sellerTotals = new Map<string, { revenue: number; sales: number }>();
    for (const t of approvedTx) {
      const key = String(t.userId);
      const bucket = sellerTotals.get(key) || { revenue: 0, sales: 0 };
      bucket.revenue += t.amount || 0;
      bucket.sales += 1;
      sellerTotals.set(key, bucket);
    }
    const sellerRecords = await Seller.find({ userId: { $in: Array.from(sellerTotals.keys()) } })
      .select("userId name")
      .lean();
    const nameByUserId = new Map(sellerRecords.map((s) => [String(s.userId), s.name]));
    const topSellers = Array.from(sellerTotals.entries())
      .map(([userId, v]) => ({ name: nameByUserId.get(userId) || "Seller", revenue: v.revenue, sales: v.sales }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // 📆 Comparação mensal — mês corrente vs mês anterior (calendário, não limitado ao período selecionado)
    const now = new Date();
    const startCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const [currentMonthTx, lastMonthTx] = await Promise.all([
      Transaction.find({ type: "deposit", status: "approved", createdAt: { $gte: startCurrentMonth }, "metadata.source": { $ne: "partner_split" } }).lean(),
      Transaction.find({ type: "deposit", status: "approved", createdAt: { $gte: startLastMonth, $lt: startCurrentMonth }, "metadata.source": { $ne: "partner_split" } }).lean(),
    ]);

    const monthlyComparison = {
      currentMonth: {
        revenue: currentMonthTx.reduce((s, t) => s + (t.amount || 0), 0),
        sales: currentMonthTx.length,
      },
      lastMonth: {
        revenue: lastMonthTx.reduce((s, t) => s + (t.amount || 0), 0),
        sales: lastMonthTx.length,
      },
    };

    const conversionRate = transactions.length > 0 ? (approvedTx.length / transactions.length) * 100 : 0;
    const averageTicket =
      approvedTx.length > 0 ? approvedTx.reduce((s, t) => s + (t.amount || 0), 0) / approvedTx.length : 0;

    res.status(200).json({
      status: true,
      analytics: {
        dailyRevenue,
        topSellers,
        monthlyComparison,
        conversionRate,
        averageTicket,
        totalTransactions: transactions.length,
      },
    });
  } catch (error) {
    console.error("❌ Erro em getAnalytics:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao calcular analytics." });
  }
};

/**
 * 📋 Lista as transações mais recentes da plataforma (visão admin)
 */
export const listTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 200);
    const status = req.query.status as string | undefined;

    // Repasse de parceria (metadata.source: "partner_split") não é uma venda
    // própria de ninguém — fica de fora daqui, tem visão dedicada em
    // GET /master/split-transactions (ver Split de Pagamentos no painel).
    const query: Record<string, unknown> = { "metadata.source": { $ne: "partner_split" } };
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.status(200).json({ status: true, transactions });
  } catch (error) {
    console.error("❌ Erro em listTransactions:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao listar transações." });
  }
};

/**
 * GET /master/split-transactions
 * Todos os repasses de parceria da plataforma — visão de auditoria do
 * master, separada da lista geral de transações.
 */
export const listSplitTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const transactions = await Transaction.find({ "metadata.source": "partner_split" })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Enriquece com nome/email do destinatário (dono da própria transação) —
    // o registro só carrega snapshotado quem PAGOU (splitFrom), não quem
    // recebeu, então aqui é o único lugar que precisa dos dois lados.
    const recipientSellers = await Seller.find({ userId: { $in: transactions.map((t) => t.userId) } })
      .select("userId name email")
      .lean();
    const sellerByUserId = new Map(recipientSellers.map((s) => [String(s.userId), s]));

    const enriched = transactions.map((t) => ({
      ...t,
      recipientSeller: sellerByUserId.get(String(t.userId)) || null,
    }));

    res.status(200).json({ status: true, transactions: enriched });
  } catch (error) {
    console.error("❌ Erro em listSplitTransactions:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao listar repasses de parceria." });
  }
};

/**
 * 🏆 Top 10 produtos mais vendidos
 */
export const getMostSaleProducts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const top = await Transaction.aggregate([
      { $match: { status: "approved" } },
      { $unwind: "$purchaseData.products" },
      {
        $group: {
          _id: "$purchaseData.products.name",
          product: { $first: "$purchaseData.products" },
          userId: { $first: "$userId" },
          totalSold: { $sum: 1 },
          totalRevenue: { $sum: "$purchaseData.products.price" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $addFields: {
          userEmail: { $arrayElemAt: ["$user.email", 0] },
          userName: { $arrayElemAt: ["$user.name", 0] },
        },
      },
      { $project: { user: 0 } },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ]);

    res.status(200).json({ status: true, topProducts: top });
  } catch (error) {
    console.error("❌ Erro em getMostSaleProducts:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar top produtos." });
  }
};

/**
 * 🏦 Lista as adquirentes existentes no código (implementadas ou não) com status
 * de configuração real (env vars) e quantos sellers estão atribuídos a cada uma.
 */
export const listAcquirers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const catalog: Array<{
      key: string;
      name: string;
      implemented: boolean;
      configured: boolean;
      missingEnv: string[];
    }> = [
      {
        key: "zendry",
        name: "Zendry",
        implemented: ACQUIRER_KEYS.includes("zendry" as any),
        configured: Boolean(process.env.ZENDRY_CLIENT_ID) && Boolean(process.env.ZENDRY_CLIENT_SECRET),
        missingEnv: [
          !process.env.ZENDRY_CLIENT_ID ? "ZENDRY_CLIENT_ID" : null,
          !process.env.ZENDRY_CLIENT_SECRET ? "ZENDRY_CLIENT_SECRET" : null,
        ].filter((v): v is string => Boolean(v)),
      },
      {
        key: "sttart",
        name: "Sttart",
        implemented: ACQUIRER_KEYS.includes("sttart" as any),
        configured:
          Boolean(process.env.STTART_API_BASE_URL) &&
          Boolean(process.env.STTART_CLIENT_ID) &&
          Boolean(process.env.STTART_CLIENT_SECRET),
        missingEnv: [
          !process.env.STTART_API_BASE_URL ? "STTART_API_BASE_URL" : null,
          !process.env.STTART_CLIENT_ID ? "STTART_CLIENT_ID" : null,
          !process.env.STTART_CLIENT_SECRET ? "STTART_CLIENT_SECRET" : null,
        ].filter((v): v is string => Boolean(v)),
      },
    ];

    // 🏦 Adquirente por método (2026-08-30) — a contagem "sellers atribuídos"
    // agora reflete a capability "pix" JÁ RESOLVIDA (aplica o fallback pro
    // campo antigo `acquirer`), não mais o campo único cru. Pix é usado por
    // praticamente todo seller, então é a métrica mais representativa.
    const sellersForCount = await Seller.find().select("acquirer acquirerConfig").lean();
    const countsByKey = sellersForCount.reduce<Record<string, number>>((acc, seller) => {
      try {
        const key = resolveSellerAcquirer(seller, "pix");
        acc[key] = (acc[key] || 0) + 1;
      } catch {
        // Pix desligado de propósito pra esse seller — não conta em nenhuma adquirente.
      }
      return acc;
    }, {});

    const acquirers = catalog.map((item) => ({
      ...item,
      sellersCount: countsByKey[item.key] || 0,
      active: item.implemented && item.configured,
    }));

    res.status(200).json({ status: true, acquirers });
  } catch (error) {
    console.error("❌ Erro em listAcquirers:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao listar adquirentes." });
  }
};

/**
 * 💳 GET /api/master/fees/default
 * Tabela de taxas padrão da plataforma (snapshot usado em todo seller novo).
 */
export const getDefaultFees = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;

  try {
    const config = await getOrCreateDefaultFeeConfig();
    res.status(200).json({ status: true, feeTable: config.feeTable });
  } catch (error) {
    console.error("❌ Erro em getDefaultFees:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar taxas padrão." });
  }
};

/**
 * 💳 PUT /api/master/fees/default
 * Atualiza a tabela de taxas padrão — NÃO altera sellers já cadastrados
 * (cada um tem seu próprio snapshot em Seller.feeTable).
 */
export const updateDefaultFees = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;

  try {
    const { feeTable } = req.body;
    if (!feeTable) {
      res.status(400).json({ status: false, msg: "feeTable é obrigatório." });
      return;
    }

    const config = await SystemFeeConfig.findOneAndUpdate(
      { key: "default" },
      { $set: { feeTable } },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({ status: true, msg: "✅ Taxas padrão atualizadas.", feeTable: config.feeTable });
  } catch (error) {
    console.error("❌ Erro em updateDefaultFees:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar taxas padrão." });
  }
};

/**
 * 🤝 GET /api/master/split-rules
 * Visão de supervisão — todas as parcerias de split da plataforma.
 */
export const listAllSplitRules = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;

  try {
    const rules = await SplitRule.find()
      .populate("payingSellerId", "name email")
      .populate("recipientSellerId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ status: true, rules });
  } catch (error) {
    console.error("❌ Erro em listAllSplitRules:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao listar parcerias." });
  }
};

/**
 * 🔁 POST /api/master/reconcile-zendry-pix
 * Rede de segurança pro problema de webhook da Zendry nunca chegando (ver
 * zendryWebhook.controller.ts) — consulta a Zendry direto pelas transações
 * Pix "pending" há mais de alguns minutos e aplica o status real. Também
 * roda sozinho a cada 10min (ver server.ts), isso aqui é pra forçar na hora.
 */
export const reconcileZendryPix = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;

  try {
    const result = await reconcilePendingZendryPix();
    res.status(200).json({ status: true, ...result });
  } catch (error) {
    console.error("❌ Erro em reconcileZendryPix:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao reconciliar." });
  }
};

/**
 * 💸 POST /api/master/transactions/:id/refund
 * POST /api/master/transactions/:id/chargeback
 * POST /api/master/transactions/:id/partial-cancel
 *
 * Registro MANUAL — a PyxGate não chama nenhuma API de adquirente aqui
 * (nem Zendry nem Sttart têm estorno confirmado, ver
 * services/paymentReversal.service.ts). O dinheiro já foi devolvido pelo
 * master fora do sistema; isso só reverte nosso próprio ledger/wallet e
 * avisa o seller via webhook. `reason` obrigatório pra trilha de auditoria.
 */
export const refundTransaction = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;

  const { reason } = req.body;
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ status: false, msg: "Motivo do reembolso é obrigatório." });
    return;
  }

  try {
    const transaction = await recordManualRefund(req.params.id, String(user._id), reason.trim());
    res.status(200).json({ status: true, transaction });
  } catch (error: any) {
    console.error("❌ Erro em refundTransaction:", error);
    res.status(400).json({ status: false, msg: error.message || "Erro ao registrar reembolso." });
  }
};

export const chargebackTransaction = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;

  const { reason } = req.body;
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ status: false, msg: "Motivo do chargeback é obrigatório." });
    return;
  }

  try {
    const transaction = await recordChargeback(req.params.id, String(user._id), reason.trim());
    res.status(200).json({ status: true, transaction });
  } catch (error: any) {
    console.error("❌ Erro em chargebackTransaction:", error);
    res.status(400).json({ status: false, msg: error.message || "Erro ao registrar chargeback." });
  }
};

/* -------------------------------------------------------------------------- */
/* 🔔 Webhooks — ferramenta de suporte (master gerenciando o webhook de um    */
/* seller específico) + webhooks de plataforma (scope "platform")            */
/* -------------------------------------------------------------------------- */

export const listSellerWebhookEndpointsAsMaster = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;
  try {
    const endpoints = await listWebhookEndpoints(req.params.id);
    res.status(200).json({ status: true, webhookEndpoints: endpoints.map((e) => e.toJSON()) });
  } catch (error) {
    console.error("❌ Erro em listSellerWebhookEndpointsAsMaster:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao listar webhook endpoints." });
  }
};

export const createSellerWebhookEndpointAsMaster = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;
  const { url, events } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({ status: false, msg: "url é obrigatória." });
    return;
  }
  if (!isValidEventList(events)) {
    res.status(400).json({ status: false, msg: "events inválido." });
    return;
  }
  try {
    const endpoint = await createWebhookEndpoint(req.params.id, url, events);
    res.status(201).json({ status: true, webhookEndpoint: endpoint.toJSON() });
  } catch (error) {
    console.error("❌ Erro em createSellerWebhookEndpointAsMaster:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao criar webhook endpoint." });
  }
};

export const updateSellerWebhookEndpointAsMaster = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;
  const { url, events, active } = req.body;
  if (events !== undefined && !isValidEventList(events)) {
    res.status(400).json({ status: false, msg: "events inválido." });
    return;
  }
  try {
    const endpoint = await updateWebhookEndpoint(req.params.id, req.params.endpointId, { url, events, active });
    if (!endpoint) {
      res.status(404).json({ status: false, msg: "Webhook endpoint não encontrado." });
      return;
    }
    res.status(200).json({ status: true, webhookEndpoint: endpoint.toJSON() });
  } catch (error) {
    console.error("❌ Erro em updateSellerWebhookEndpointAsMaster:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar webhook endpoint." });
  }
};

export const deleteSellerWebhookEndpointAsMaster = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;
  try {
    const endpoint = await deleteWebhookEndpoint(req.params.id, req.params.endpointId);
    if (!endpoint) {
      res.status(404).json({ status: false, msg: "Webhook endpoint não encontrado." });
      return;
    }
    res.status(200).json({ status: true, msg: "Webhook endpoint removido." });
  } catch (error) {
    console.error("❌ Erro em deleteSellerWebhookEndpointAsMaster:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao remover webhook endpoint." });
  }
};

export const listPlatformWebhookEndpointsHandler = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;
  try {
    const endpoints = await listPlatformWebhookEndpoints();
    res.status(200).json({ status: true, webhookEndpoints: endpoints.map((e) => e.toJSON()) });
  } catch (error) {
    console.error("❌ Erro em listPlatformWebhookEndpointsHandler:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao listar webhooks de plataforma." });
  }
};

export const createPlatformWebhookEndpointHandler = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;
  const { url, events } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({ status: false, msg: "url é obrigatória." });
    return;
  }
  if (!isValidPlatformEventList(events)) {
    res.status(400).json({ status: false, msg: "events inválido." });
    return;
  }
  try {
    const endpoint = await createPlatformWebhookEndpoint(url, events);
    res.status(201).json({ status: true, webhookEndpoint: endpoint.toJSON() });
  } catch (error) {
    console.error("❌ Erro em createPlatformWebhookEndpointHandler:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao criar webhook de plataforma." });
  }
};

export const updatePlatformWebhookEndpointHandler = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;
  const { url, events, active } = req.body;
  if (events !== undefined && !isValidPlatformEventList(events)) {
    res.status(400).json({ status: false, msg: "events inválido." });
    return;
  }
  try {
    const endpoint = await updatePlatformWebhookEndpoint(req.params.id, { url, events, active });
    if (!endpoint) {
      res.status(404).json({ status: false, msg: "Webhook endpoint não encontrado." });
      return;
    }
    res.status(200).json({ status: true, webhookEndpoint: endpoint.toJSON() });
  } catch (error) {
    console.error("❌ Erro em updatePlatformWebhookEndpointHandler:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar webhook de plataforma." });
  }
};

export const deletePlatformWebhookEndpointHandler = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;
  try {
    const endpoint = await deletePlatformWebhookEndpoint(req.params.id);
    if (!endpoint) {
      res.status(404).json({ status: false, msg: "Webhook endpoint não encontrado." });
      return;
    }
    res.status(200).json({ status: true, msg: "Webhook endpoint removido." });
  } catch (error) {
    console.error("❌ Erro em deletePlatformWebhookEndpointHandler:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao remover webhook de plataforma." });
  }
};

export const partialCancelTransaction = async (req: Request, res: Response): Promise<void> => {
  const user = await requireMasterUser(req, res);
  if (!user) return;

  const { reason, amount } = req.body;
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ status: false, msg: "Motivo do cancelamento parcial é obrigatório." });
    return;
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ status: false, msg: "Valor do cancelamento parcial inválido." });
    return;
  }

  try {
    const transaction = await recordPartialCancellation(req.params.id, parsedAmount, String(user._id), reason.trim());
    res.status(200).json({ status: true, transaction });
  } catch (error: any) {
    console.error("❌ Erro em partialCancelTransaction:", error);
    res.status(400).json({ status: false, msg: error.message || "Erro ao registrar cancelamento parcial." });
  }
};
