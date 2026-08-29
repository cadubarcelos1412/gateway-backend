// src/utils/timezone.ts
// O servidor roda em UTC (padrão do Render), mas o negócio inteiro é
// brasileiro — "hoje" precisa significar o dia em horário de Brasília, não
// o dia em UTC. Sem isso, uma venda feita entre 21h e 23h59 (BRT) já vira
// "amanhã" pro servidor (BRT = UTC-3), inflando/computando errado qualquer
// corte por dia feito com Date.toDateString()/getMonth()/getFullYear() cru.
// Achado em 2026-08-12: "Volume hoje" do master contava vendas que a lista
// de transações (formatada em horário local do navegador) ainda mostrava
// como "ontem".

/** Chave de dia estável (YYYY-MM-DD) no horário de Brasília — segura pra comparar. */
export function brazilDateKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Chave de mês estável (YYYY-MM) no horário de Brasília. */
export function brazilMonthKey(date: Date): string {
  return brazilDateKey(date).slice(0, 7);
}

// Brasil aboliu horário de verão em 2019 — offset fixo -03:00 é seguro pra
// qualquer data usada aqui (KPIs recentes, nunca histórico pré-2019).

/** Início/fim (instantes UTC) do dia "de hoje" em horário de Brasília — pra
 * usar em $gte/$lt de query, aproveitando índice em createdAt (ao contrário
 * de filtrar comparando string em cada documento). */
export function brazilDayBounds(date: Date): { start: Date; end: Date } {
  const key = brazilDateKey(date);
  const start = new Date(`${key}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Início/fim (instantes UTC) do mês corrente em horário de Brasília. */
export function brazilMonthBounds(date: Date): { start: Date; end: Date } {
  const monthKey = brazilMonthKey(date);
  const start = new Date(`${monthKey}-01T00:00:00-03:00`);
  const [year, month] = monthKey.split("-").map(Number);
  const nextMonthKey = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const end = new Date(`${nextMonthKey}-01T00:00:00-03:00`);
  return { start, end };
}
