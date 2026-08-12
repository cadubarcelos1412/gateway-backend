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
