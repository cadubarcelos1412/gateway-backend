import { zendryFetch } from "./client";

// Integração com a API de cripto (USDT) da Zendry — categoria
// developers.zendry.com.br/en/docs/category/cripto/, lida ao vivo em
// 2026-08-04, sem sandbox pra saque (só POST /v1/crypto/receivement simula
// RECEBIMENTO, e só em staging — não serve pra testar saque).
//
// Rede da carteira (TRC20?) e precisão numérica não são declaradas na
// documentação — inferidas do formato do endereço de exemplo
// ("TLyxu5on2Jdkcn5Y9TBfoTCXaQR4gG8rAL") e do exemplo de valor ("1.49").
// Confirmar com o suporte da Zendry antes de depender disso em produção.

export interface UsdtQuote {
  /** Preço de 1 USDT em BRL — ex.: 5.51486348. Sem spread declarado pela Zendry. */
  brlPrice: number;
}

// GET /v1/crypto/quotations/usdt — sem efeito colateral, pode ser chamado
// livremente (usado tanto no saque real quanto no script de teste manual).
export async function getUsdtQuote(): Promise<UsdtQuote> {
  const { brl_price } = await zendryFetch<{ brl_price: string }>(
    "/v1/crypto/quotations/usdt",
    { method: "GET" }
  );
  return { brlPrice: Number(brl_price) };
}

export interface TreasuryWallet {
  walletId: string;
  address: string;
}

// POST /v1/crypto/wallets — cria uma wallet custodiada NOSSA (não do
// seller). Uso ÚNICO/MANUAL: rode uma vez via script (ver
// scripts/zendry/test-crypto-wallet-create.mjs), guarde o wallet_id em
// ZENDRY_TREASURY_WALLET_ID, e fundeie essa wallet com USDT comprado por
// fora — não existe endpoint que converta nosso BRL em USDT de verdade,
// só a cotação (getUsdtQuote). Não chamar isso a cada saque.
export async function createTreasuryWallet(): Promise<TreasuryWallet> {
  const { crypto_wallet } = await zendryFetch<{
    crypto_wallet: { wallet_id: string; address: string };
  }>("/v1/crypto/wallets", { method: "POST" });
  return { walletId: crypto_wallet.wallet_id, address: crypto_wallet.address };
}

export interface SendUsdtPaymentInput {
  /** wallet_id da NOSSA wallet-tesouro (ZENDRY_TREASURY_WALLET_ID), já fundeada com USDT. */
  senderWalletId: string;
  /** Endereço USDT de destino informado pelo seller no momento do saque. */
  receiverAddress: string;
  /** Valor em USDT (não em BRL) — já convertido pela cotação antes de chamar isso. */
  valueUsdt: number;
}

export interface SendUsdtPaymentResult {
  referenceCode: string;
  status: string;
}

// POST /v1/crypto/payments — o SAQUE em si: manda USDT de verdade da nossa
// wallet-tesouro pro endereço do seller. Irreversível uma vez aceito pela
// Zendry. Não existe endpoint de status/webhook documentado pra saber
// quando `status: "pending"` (retornado aqui) vira confirmado.
export async function sendUsdtPayment(input: SendUsdtPaymentInput): Promise<SendUsdtPaymentResult> {
  const { crypto_payment } = await zendryFetch<{
    crypto_payment: { reference_code: string; status: string };
  }>("/v1/crypto/payments", {
    method: "POST",
    body: {
      value: input.valueUsdt.toFixed(2),
      crypto_currency: "usdt",
      receiver_address: input.receiverAddress,
      sender_wallet_id: input.senderWalletId,
    },
  });
  return { referenceCode: crypto_payment.reference_code, status: crypto_payment.status };
}
