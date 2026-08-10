import { Request, Response, NextFunction } from "express";
import { Transaction } from "../models/transaction.model";
import { User } from "../models/user.model";
import { Seller } from "../models/seller.model";
import { createToken, decodeToken } from "../config/auth";
import { ACQUIRER_KEYS } from "../acquirers";
import { getOrCreateDefaultFeeConfig, SystemFeeConfig } from "../models/systemFeeConfig.model";
import { SplitRule } from "../models/splitRule.model";
import { reconcilePendingZendryPix } from "../services/zendryReconciliation.service";

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
export const getKpas = async (_req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date();

    // 📦 Busca dados
    const [transactions, users] = await Promise.all([
      Transaction.find().lean(),
      User.find().lean(),
    ]);

    const approvedTx = transactions.filter((t) => t.status === "approved");

    // 📊 Cálculos principais — SÓ transações aprovadas contam como volume/
    // taxa/ticket real. Contar pending/failed aqui já causou "saldo
    // fantasma" idêntico no dashboard do seller (ver correção de wallet em
    // 2026-08-10) — mesmo erro, versão agregada pro master.
    const volumeTotal = approvedTx.reduce((sum, t) => sum + (t.amount || 0), 0);
    const volumeHoje = approvedTx
      .filter((t) => t.createdAt && new Date(t.createdAt).toDateString() === today.toDateString())
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalUsuarios = users.length;
    const usuariosHoje = users.filter(
      (u) => u.createdAt && new Date(u.createdAt).toDateString() === today.toDateString()
    ).length;

    const totalTaxas = approvedTx.reduce((sum, t) => sum + (t.fee || 0), 0);
    const taxasMensais = approvedTx
      .filter(
        (t) =>
          t.createdAt &&
          new Date(t.createdAt).getMonth() === today.getMonth() &&
          new Date(t.createdAt).getFullYear() === today.getFullYear()
      )
      .reduce((sum, t) => sum + (t.fee || 0), 0);

    // Taxa de conversão é a única métrica aqui que precisa do TOTAL de
    // tentativas no denominador, por definição (aprovadas / todas).
    const taxaConversao =
      transactions.length > 0 ? (approvedTx.length / transactions.length) * 100 : 0;
    const ticketMedio = approvedTx.length > 0 ? volumeTotal / approvedTx.length : 0;

    const volumePorMetodo = approvedTx.reduce<Record<string, number>>((acc, t) => {
      if (!t.method) return acc;
      acc[t.method] = (acc[t.method] || 0) + (t.amount || 0);
      return acc;
    }, {});

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

    const transactions = await Transaction.find({ type: "deposit", createdAt: { $gte: since } }).lean();

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
      Transaction.find({ type: "deposit", status: "approved", createdAt: { $gte: startCurrentMonth } }).lean(),
      Transaction.find({ type: "deposit", status: "approved", createdAt: { $gte: startLastMonth, $lt: startCurrentMonth } }).lean(),
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

    const query: Record<string, unknown> = {};
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
    ];

    const sellerCounts = await Seller.aggregate([
      { $group: { _id: "$acquirer", total: { $sum: 1 } } },
    ]);
    const countsByKey = sellerCounts.reduce<Record<string, number>>((acc, row) => {
      if (row._id) acc[row._id] = row.total;
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
