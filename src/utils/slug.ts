import crypto from "crypto";

// Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/l) — pra slug que às vezes
// vai ser digitado/ditado por telefone, não só clicado num link.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

/** Gera um código curto aleatório (default 7 chars) pra usar como slug público. */
export function generateSlug(length = 7): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
}
