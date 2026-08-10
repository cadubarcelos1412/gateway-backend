import { ClientSession } from "mongoose";
import { IWallet, Wallet } from "../models/wallet.model";

/**
 * Move pra "available" as reservas de unAvailable cuja availableIn já
 * passou. Não move dinheiro real nenhum — só corrige o saldo exibido/
 * sacável, que fica desatualizado até isso rodar (ver releaseAllMaturedWallets
 * pra por que isso importa: antes disso não existia NENHUM gatilho
 * automático, só um endpoint manual que nada chamava).
 */
export async function releaseMaturedBalance(wallet: IWallet, session?: ClientSession): Promise<number> {
  const now = new Date();
  let released = 0;
  const stillLocked = [];

  for (const entry of wallet.balance.unAvailable) {
    if (entry.availableIn <= now) {
      wallet.balance.available += entry.amount;
      released += entry.amount;
    } else {
      stillLocked.push(entry);
    }
  }

  if (released > 0) {
    wallet.balance.unAvailable = stillLocked as IWallet["balance"]["unAvailable"];
    await wallet.save({ session });
  }

  return released;
}

/**
 * Varredura de segurança — libera saldo maduro em TODAS as carteiras, não só
 * na do seller que está com o dashboard aberto agora. Cobre o caso de
 * ninguém consultar `getMyWallet` nem chamar cashout no momento exato em que
 * o valor amadurece (ver server.ts pro agendamento).
 */
export async function releaseAllMaturedWallets(): Promise<{
  walletsChecked: number;
  walletsReleased: number;
  totalReleased: number;
}> {
  const now = new Date();
  const candidates = await Wallet.find({ "balance.unAvailable.availableIn": { $lte: now } });

  let walletsReleased = 0;
  let totalReleased = 0;

  for (const wallet of candidates) {
    const released = await releaseMaturedBalance(wallet);
    if (released > 0) {
      walletsReleased++;
      totalReleased += released;
    }
  }

  return { walletsChecked: candidates.length, walletsReleased, totalReleased };
}
