# Introdução

A API da PYX Gate permite criar cobranças Pix e cartão, consultar pagamentos
e receber eventos em tempo real via webhook — para você integrar pagamentos
diretamente no seu checkout ou e-commerce.

## Base URL

```
https://pyxgate-api.onrender.com/v1
```

Domínio próprio (`api.pyxgate.com`) ainda não configurado — use a URL acima.
Não existe um ambiente de sandbox separado: chaves `sk_test_...` rodam em
modo teste na mesma URL de produção (veja "Ambientes: test vs. live" abaixo).
`http://localhost:3000/v1` só é relevante se você estiver rodando o backend
localmente para contribuir com o código da PYX Gate.

Toda a API pública vive sob o prefixo `/v1`, separado das rotas internas do
painel (`/api/...`). O `/v1` é autenticado por **chave de API**, não pelo
login do dashboard — veja [autenticacao.md](./autenticacao.md).

## Ambientes: test vs. live

Cada chave de API tem um modo:

- **`sk_test_...`** — tudo que você cria com essa chave roda em **modo
  teste**: nunca chama uma adquirente real, nunca move dinheiro, nunca
  aparece nos relatórios financeiros reais do seller. A confirmação de um
  pagamento em modo teste é manual, via os endpoints de simulação (veja
  [guia-pix.md](./guia-pix.md)).
- **`sk_live_...`** — dinheiro real. Passa pelo motor de antifraude, gera
  ledger contábil de verdade e move o saldo do seller.

Pagamentos, listagens e consultas são sempre escopados ao modo da chave
usada na requisição — uma chave de teste nunca enxerga pagamentos reais, e
vice-versa.

## Convenções

- Valores monetários são sempre **inteiros em centavos** (`amount: 1990` =
  R$ 19,90).
- Corpo e respostas são JSON.
- IDs de recursos têm prefixo por tipo: `pay_...` (pagamento), `we_...`
  (webhook endpoint), `evt_...` (evento de webhook).
- Erros seguem um formato padronizado — veja [erros.md](./erros.md).
- POSTs aceitam o header `Idempotency-Key` para evitar duplicidade em caso
  de retry — veja [idempotencia.md](./idempotencia.md).

## Recursos disponíveis hoje

| Recurso | Descrição |
|---|---|
| `POST /v1/payments` | Cria uma cobrança Pix ou cartão |
| `GET /v1/payments/:id` | Consulta um pagamento |
| `GET /v1/payments` | Lista pagamentos, paginado |
| `POST /v1/test/payments/:id/pay` \| `/fail` | Simula aprovação/falha em modo teste |
| `POST /v1/webhook_endpoints` + CRUD | Cadastra endpoints para receber eventos |
| `GET /v1/card_authentications/token` | Token pro desafio 3DS de cartão no navegador do comprador — ver [guia-cartao.md](./guia-cartao.md). Só sellers com adquirente `zendry` |
| `POST /v1/refunds` | Estorna um pagamento pago. Funciona de verdade para sellers com adquirente `pagarme`; para `zendry`, ainda não (endpoint de estorno não confirmado com o suporte deles) |

A especificação completa está em [`openapi.yaml`](./openapi.yaml). A versão
navegável, com exemplos, é a página [`/developers`](https://pyxgate.com/developers).

## Próximos passos

1. [autenticacao.md](./autenticacao.md) — gerar sua primeira chave.
2. [guia-pix.md](./guia-pix.md) — criar sua primeira cobrança em 5 minutos.
3. [webhooks.md](./webhooks.md) — receber confirmação de pagamento em tempo real.
