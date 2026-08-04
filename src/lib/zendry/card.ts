import { zendryFetch } from "./client";
import type { CreateCardPaymentInput, CreateCardPaymentResult } from "./types";

// Pagamento por cartão — POST /v1/card_payments. Modelo "adquirente direto":
// os dados do cartão (número, validade, CVV) vão diretamente no corpo desta
// requisição, feita pelo NOSSO servidor — não há tokenização client-side
// nesse fluxo (a Zendry documenta um endpoint separado,
// POST /v1/card_payments/tokenize_card, mas o projeto de origem NÃO o usa —
// confirmar com o suporte se ele é obrigatório ou opcional antes de assumir
// que dá pra pular).
//
// Implicação de compliance: como o número/CVV do cartão passam pelo NOSSO
// backend (não só visualmente — literalmente na requisição HTTP), isso te
// coloca no escopo PCI-DSS SAQ D. Isso é verdade pra qualquer venda com
// cartão, doméstica ou internacional — não é uma regra exclusiva de comércio
// internacional. Decisão consciente do dono do projeto de origem; reavalie
// pro projeto novo.
//
// 3DS é OBRIGATÓRIO — confirmado testando de verdade: sem `threeds_data` a
// API sempre recusa com 422 `{"error":"Threeds data is required"}`, sem
// exceção. O desafio 3DS roda no NAVEGADOR do cliente via SDK
// (`https://cdn.zendry.com/v1/zendry-sdk-threeds.min.js`,
// `ZendrySDKThreeds.init_threeds()`) e usa o MESMO access_token Bearer do
// backend — confirmado por escrito com o suporte da Zendry. Isso expõe esse
// token no navegador de QUALQUER cliente durante o checkout. A Zendry
// confirmou que dá pra whitelistar por IP as OUTRAS rotas (pix/qrcodes,
// card_payments, etc.) pra pelo menos impedir que um token roubado seja
// usado fora do fluxo de 3DS — mas isso exige IP de saída FIXO do seu
// servidor (Vercel exige plano pago com Secure Compute pra isso). O projeto
// de origem decidiu seguir SEM whitelist de IP (aceitando o risco). Ver
// ZENDRY-MIGRATION.md, seção "Configuração de IP", antes de decidir o mesmo
// pro projeto novo.
export async function createCardPayment(
  input: CreateCardPaymentInput
): Promise<CreateCardPaymentResult> {
  const { card_payment: payment } = await zendryFetch<{
    card_payment: {
      muid: string;
      status: string;
      last_digits?: string;
      brand?: string;
      authorization_code?: string;
    };
  }>("/v1/card_payments", {
    method: "POST",
    body: {
      card_payment: {
        external_id: input.externalId,
        amount: Math.round(input.amountBRL * 100),
        currency: "BRL",
        payment_type: "CREDIT",
        card_number: input.cardNumber.replace(/\D/g, ""),
        card_expiration_date: input.cardExpirationDate,
        card_security_code: input.cardSecurityCode,
        card_holder_name: input.cardHolderName.trim(),
        card_holder_document: input.cardHolderDocument.replace(/\D/g, ""),
        installments: input.installments,
        threeds_data: input.threedsData,
      },
    },
  });

  return {
    muid: payment.muid,
    status: payment.status as CreateCardPaymentResult["status"],
    lastDigits: payment.last_digits,
    brand: payment.brand,
    authorizationCode: payment.authorization_code,
  };
}

// SEGURANÇA — nunca logar, imprimir em erro, ou persistir em qualquer coluna
// /metadata: card_number, card_security_code, ou o `threeds_data` bruto
// (contém ip_address e dados de navegador do cliente, PII). Persista só os
// campos seguros da resposta: muid, status, last_digits, brand,
// authorization_code.
//
// Consulta / captura / cancelamento / estorno: NENHUM desses endpoints foi
// confirmado contra a API real durante o desenvolvimento do projeto de
// origem — a resposta síncrona deste POST já traz o resultado final
// ("accepted" | "reject" | "waiting_3ds_authentication"), sem uma etapa de
// captura separada. Se o novo projeto precisar de estorno/cancelamento,
// confirme os endpoints com o suporte da Zendry antes de implementar — não
// estão documentados nas páginas consultadas nesta auditoria.
