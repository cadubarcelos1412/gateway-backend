// src/utils/publicIds.ts

/**
 * IDs públicos são derivados do ObjectId do Mongo prefixados (ex.: pay_<hex>),
 * sem precisar de um campo extra armazenado no documento — o ObjectId já é
 * único e imutável, o prefixo é só uma convenção de apresentação (padrão Stripe).
 */
export function toPublicId(prefix: string, mongoId: unknown): string {
  return `${prefix}_${String(mongoId)}`;
}

/** Extrai o ObjectId hex de um id público (ex.: "pay_<hex>" -> "<hex>"). Retorna null se o prefixo não bater. */
export function fromPublicId(prefix: string, publicId: string): string | null {
  const expectedPrefix = `${prefix}_`;
  if (!publicId.startsWith(expectedPrefix)) return null;
  const rawId = publicId.slice(expectedPrefix.length);
  return /^[a-f0-9]{24}$/i.test(rawId) ? rawId : null;
}
