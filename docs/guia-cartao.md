# Guia: Cartão

## ⚠️ Leia isto antes de integrar cartão

Diferente do Pix, a integração de cartão desta API **não está 100%
pronta para uso por terceiros ainda**. Duas coisas que você precisa saber
antes de investir tempo integrando:

1. **Compliance PCI**: o número, validade e CVV do cartão trafegam
   diretamente no corpo da sua requisição para `POST /v1/payments` — eles
   passam pelo nosso backend antes de chegar na adquirente (Zendry). Isso
   coloca **você** (quem envia os dados) no escopo de responsabilidade PCI-DSS
   equivalente a manipular dados de cartão diretamente. Não há tokenização
   client-side disponível hoje (foi uma decisão consciente do time, ver
   `docs/ARQUITETURA.md`). Se sua operação exige reduzir esse escopo, cartão
   não deve ser usado nesta API por enquanto.

2. **3DS é obrigatório e o fluxo de coleta ainda é interno**: a Zendry
   recusa qualquer pagamento de cartão sem `threeds_data` (confirmado em
   produção, erro 422 `"Threeds data is required"`). Esse dado é gerado por
   um desafio 3DS que roda no **navegador do comprador**, via SDK da própria
   Zendry (`ZendrySDKThreeds.init_threeds()`). Hoje, no nosso próprio
   checkout interno, esse SDK é carregado mas **`init_threeds()` ainda não é
   chamado** — ou seja, nem o fluxo interno está terminado, e não temos um
   exemplo de código funcional e testado para te dar aqui. Documentar um
   exemplo fictício seria enganoso.

**Recomendação**: para pagamentos com cartão hoje, use Pix
([guia-pix.md](./guia-pix.md)) ou fale com o time da PYX Gate para alinhar
o roadmap de cartão antes de integrar.

## O que já funciona, tecnicamente

Se você já tem `threeds_data` válido (por já ter implementado o desafio 3DS
da Zendry por fora), o endpoint aceita:

```bash
curl -X POST http://localhost:3000/v1/payments \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 15000,
    "payment_method": "card",
    "customer": {
      "name": "Maria Compradora",
      "email": "maria@example.com",
      "document": "39053344705"
    },
    "card": {
      "number": "4242424242424242",
      "holder_name": "MARIA COMPRADORA",
      "expiration_date": "122029",
      "security_code": "123",
      "installments": 1
    },
    "threeds_data": { "...": "..." }
  }'
```

Em **modo teste** (`sk_test_...`), o campo `threeds_data` ainda é exigido
pela validação do payload, mas seu conteúdo não é verificado de verdade
(nenhuma chamada à Zendry acontece em modo teste) — envie qualquer objeto
não vazio. A cobrança nasce `pending` e você a confirma via
`POST /v1/test/payments/:id/pay`, igual ao fluxo Pix.

Em **modo live**, o `threeds_data` precisa ser o resultado real do desafio
3DS da Zendry — sem uma implementação funcional desse passo (ver aviso
acima), a chamada será recusada pela adquirente.

## Próximos passos (para o time PYX Gate, não para o integrador)

Antes deste guia poder oferecer um exemplo de ponta a ponta:

1. Terminar `init_threeds()` no checkout interno e confirmar o shape real de `threeds_data`.
2. Decidir se a API pública expõe esse mesmo padrão (SDK client-side rodando com credenciais da PYX Gate, não do integrador) ou se cartão precisa de uma abordagem diferente para terceiros.
