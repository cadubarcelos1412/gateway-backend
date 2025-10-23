import { PagarmeAcquirer } from "./pagarme.acquirer";

export const getAcquirer = (key: string) => {
  const map: Record<string, any> = {
    pagarme: PagarmeAcquirer,
  };
  const Acquirer = map[key];
  if (!Acquirer) throw new Error(`Adquirente desconhecida: ${key}`);
  return new Acquirer();
};