/**
 * 🔢 Funções auxiliares contábeis do Ledger
 * - Arredondamento e formatação numérica
 */

export const round2 = (num: number): number => {
  if (typeof num !== "number" || isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
