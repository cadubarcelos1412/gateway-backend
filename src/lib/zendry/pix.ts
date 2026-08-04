import { zendryFetch } from "./client";
import type { CreatePixInput, CreatePixResult } from "./types";

// Pix embutido na própria página (QR Code + copia-e-cola) — POST /v1/pix/qrcodes.
// Diferente do "checkout hospedado" (POST /v1/charges, que redireciona o
// cliente pra pay.zendry.com): esse é o fluxo usado no projeto de origem,
// escolhido porque o cliente nunca sai do site.
//
// Campos aceitos pela Zendry (confirmados testando contra a API real):
//   value_cents         number  obrigatório — valor em CENTAVOS
//   generator_name       string  obrigatório — nome de quem paga
//   generator_document   string  opcional    — CPF/CNPJ de quem paga
//   expiration_time      string  obrigatório — segundos até expirar, como STRING
//   external_reference    string  obrigatório — sua referência (nº do pedido)
//
// Não existe campo `callback_url` nesse payload — o destino do webhook é
// configurado à parte (ver webhook.ts e ZENDRY-MIGRATION.md, seção Webhooks).
export async function createPix(input: CreatePixInput): Promise<CreatePixResult> {
  const { qrcode } = await zendryFetch<{
    qrcode: { reference_code: string; content: string; image_base64: string };
  }>("/v1/pix/qrcodes", {
    method: "POST",
    body: {
      value_cents: Math.round(input.amountBRL * 100),
      generator_name: input.payerName,
      ...(input.payerDocument ? { generator_document: input.payerDocument } : {}),
      expiration_time: String(input.expirationSeconds ?? 1800),
      external_reference: input.externalReference,
    },
  });

  return {
    referenceCode: qrcode.reference_code,
    pixCode: qrcode.content,
    qrCodeBase64: qrcode.image_base64,
  };
}

// IMPORTANTE: não existe endpoint de consulta de status confirmado pra Pix
// nessa API. No desenvolvimento do projeto de origem, tentou-se GET
// /v1/charges/{reference_code} e variações contra a API real — nenhuma
// respondeu de forma utilizável. A confirmação de pagamento depende
// exclusivamente do webhook (ver webhook.ts). Se precisar consultar status
// sob demanda no futuro, confirme com o suporte da Zendry se existe endpoint
// dedicado — não foi encontrado na documentação pública.
