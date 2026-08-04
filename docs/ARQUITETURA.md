# Arquitetura — `gateway-clean`

Última atualização: 2026-08-04, ao final da iniciativa "API pública + chaves
de API" (Etapas 1–4). Este documento nasceu de uma auditoria do estado
anterior do sistema e foi reescrito para refletir o estado atual. Todos os
caminhos são relativos a `gateway-clean/`.

## Visão geral

O backend expõe três superfícies distintas, cada uma com seu próprio
modelo de autenticação:

| Superfície | Prefixo | Autenticação | Público |
|---|---|---|---|
| Painel interno (dashboard) | `/api/...` | JWT (login de seller/admin/master) | Sellers e administração da própria PYX Gate |
| API pública | `/v1/...` | API key (`Authorization: Bearer sk_...`) | Terceiros integrando pagamentos |
| Checkout público | `/api/checkout/...` | Nenhuma (por design, é acessado pelo comprador) | Compradores finais |

## Bootstrap

`src/server.ts` é o ponto de entrada real (`npm run dev`/`build`/`start`).
`src/index.ts` é um arquivo órfão, não referenciado em nenhum script —
mantido por ora (ver seção "Débitos técnicos conhecidos"), não apagado
sem necessidade real de fazê-lo.

Rotas montadas em `server.ts`:
- `/api` → `src/routes/index.ts` (painel interno)
- `/v1` → `src/routes/v1/index.ts` (API pública, autenticada por API key)
- `/docs` → Swagger UI, só fora de `NODE_ENV=production`

## Modelo de dados — visão geral

```
User (login)  1:1  Seller (negócio/KYC/taxas/adquirente)  1:1  Wallet (saldo real)
                       │
                       ├── ApiKey (N)         — chaves sk_/pk_ do seller
                       ├── WebhookEndpoint (N) — endpoints de saída cadastrados
                       └── Transaction (N)     — cobranças, mode: test|live
```

`Subaccount` existe no schema mas é vestigial — criado no registro do
seller, nunca mais lido/escrito por nenhum fluxo real (o saldo de verdade
vive em `Wallet`, referenciado por `userId`, não por `sellerId`). Não
removido ainda — ver débitos técnicos.

## Autenticação

### Painel interno (JWT)

Não há middleware JWT centralizado — cada controller decodifica o token
manualmente via `decodeToken` (`src/config/auth.ts`) e resolve o `Seller`
correspondente. O único middleware de rota real combinando auth + regra de
negócio é `requireApprovedKyc` (`src/middleware/kycGuard.ts`), usado só na
criação de transação pelo fluxo real.

### API pública (chaves de API)

Formato Stripe-like: `sk_live_<64 hex>` / `sk_test_<64 hex>` (secret,
backend-only) e `pk_live_/pk_test_` (publishable, reservada para uso
client-side futuro — hoje não autentica nada em `/v1`). Corpo gerado com
`crypto.randomBytes(32)`, armazenado só como hash SHA-256
(`src/models/apiKey.model.ts`). Middleware `authApiKey`
(`src/middleware/authApiKey.ts`) resolve `req.merchant` (o `Seller`) e
`req.apiKeyMode` (`test`/`live`) a partir do header `Authorization`.

CRUD de chaves: `/api/developers/api-keys` (JWT, painel "Desenvolvedores"
em `FRONT/src/pages/Dashboard/DevelopersPage.tsx`). A chave completa só é
retornada uma vez, na criação/rotação.

## Fluxo de pagamento

### Núcleo compartilhado: `TransactionService.createTransactionCore`

`src/services/transaction.service.ts` centraliza a criação de transação,
parametrizada por `mode: "test" | "live"`. Dois pontos de entrada:

- `TransactionService.createTransaction(req, session)` — usado por
  `POST /api/transactions/create` (painel interno, JWT de seller). Resolve
  o seller do JWT, valida via `transactionSchema` (Zod, `productId`
  obrigatório), sempre roda em `mode: "live"`. Comportamento idêntico ao
  que existia antes da API pública — nada mudou para quem já usava essa
  rota.
- Controllers de `/v1/payments` (`src/controllers/v1/payment.controller.ts`)
  — resolvem o seller via API key, convertem o payload público (centavos,
  `payment_method: "pix"|"card"`) para o formato interno (reais,
  `"pix"|"credit_card"`), e chamam o núcleo com o `mode` da chave usada.

### Modo live

Idêntico ao fluxo pré-existente: calcula taxa via `Seller.split.cashIn`,
roda `RiskEngine` (flags de risco) e `RetentionEngine` (retenção
configurável), resolve o adapter de adquirente
(`src/acquirers/`, hoje `pagarme` ou `zendry`, via `Seller.acquirer`),
cria a cobrança na adquirente de verdade, grava `Transaction` + ledger de
dupla-entrada (`postLedgerEntries`) + `wallet.balance.unAvailable` +
`TransactionAudit`.

### Modo test

Inteiramente simulado — **nunca** chama a adquirente, **nunca** toca ledger
ou wallet. Cria a `Transaction` com `mode: "test"`, `externalId` fake
(`test_<uuid>`) e `paymentDetails` mockados (Pix: QR fictício; cartão:
`4242`/`visa`). Fee e retenção zerados. A confirmação é manual, via
`POST /v1/test/payments/:id/{pay,fail}` — não existe nenhum job/cron que
auto-confirme pagamentos de teste.

### Estados

`Transaction.status`: `pending → approved` ou `pending → failed`. Sem
`refunded`/`cancelled`/`expired` — não existe lógica de estorno nem
expiração automática de cobrança em nenhum lugar do sistema hoje
(`POST /v1/refunds` responde `501`, documentado como "em breve").

## Webhooks (saída)

`WebhookEndpoint` (URL + eventos + secret `whsec_...`) e `WebhookDelivery`
(log de cada tentativa de entrega). Serviço `src/services/webhook.service.ts`:
assina com `PYX-Signature: t=<ts>,v1=HMAC-SHA256(secret, "<ts>.<rawBody>")`,
entrega via `fetch` nativo, retenta em processo (não é uma fila persistente
— um restart do servidor no meio de uma janela de retry perde as
tentativas pendentes) com backoff `[0, 10s, 60s, 5min]`, 4 tentativas.

Pontos de disparo: criação de transação (`payment.created`), mudança de
status para aprovado/falho nos webhooks de adquirente (Zendry e Pagar.me)
e nos endpoints de simulação de teste (`payment.paid`/`payment.failed`).
`payment.expired` e `refund.succeeded` nunca disparam — não há mecanismo
que produza esses eventos.

CRUD de endpoints existe em dois lugares equivalentes, compartilhando a
mesma lógica (`src/services/webhookEndpoint.service.ts`): painel
(`/api/developers/webhook-endpoints`, JWT — **sem página de dashboard
ainda**, só a API) e API pública (`/v1/webhook_endpoints`, API key).

## Idempotência

Duas camadas independentes:
1. **Header `Idempotency-Key`** (`src/middleware/idempotency.ts` +
   `IdempotencyRecord`, TTL 24h) — genérico, aplicado hoje só em
   `POST /v1/payments`. Guarda e replica a resposta HTTP original.
2. **Campo `idempotencyKey` em `Transaction`** — pré-existente, usado
   internamente pelo núcleo de criação para não duplicar a chamada à
   adquirente. O controller de `/v1/payments` alimenta os dois mecanismos
   com o mesmo valor do header, quando presente.

## Convenção de valores monetários

Camadas diferentes, unidades diferentes, **de propósito**:
- API pública (`/v1`): inteiros em **centavos**, convenção Stripe-like.
- Modelo interno `Transaction.amount`: **reais** (float), como sempre foi.

A conversão acontece só na borda (`src/utils/publicPayment.ts`). Não some
que `Transaction.amount` seja centavos em nenhum código interno.

## PCI e cartão

Dados de cartão (PAN/CVV) trafegam em texto puro através do nosso backend
até a Zendry — decisão consciente de manter o padrão existente (ver
histórico de decisões no chat, 2026-08-04: "deixa do jeito que funciona").
Isso coloca qualquer venda de cartão no escopo PCI-DSS SAQ D. 3DS é
obrigatório e o desafio roda no navegador do comprador via SDK da Zendry —
mas **`init_threeds()` nunca é chamado hoje, nem no checkout interno**, então
a integração de cartão está incompleta mesmo internamente. Ver
[guia-cartao.md](./guia-cartao.md) para o que isso significa para
integradores.

## Débitos técnicos conhecidos (não corrigidos nesta iniciativa)

Estes já existiam antes da API pública e continuam existindo — fora do
escopo do trabalho de Etapas 1–4, sinalizados aqui para não serem
esquecidos:

- **Rotas sem autenticação expondo dados financeiros da plataforma
  inteira**: `GET /api/reports/financial`, `GET /api/reports/payouts`,
  `GET /api/master/kpas`, `GET /api/master/transactions`,
  `GET /api/transactions/consult?id=` (qualquer transação por ID),
  `POST /api/wallet/simulate-unavailable` (mutação livre por `userId` no
  body). Vulnerabilidade real e ativa.
- **Sem estorno automático em falha pós-criação**: quando um webhook de
  adquirente marca uma transação como `failed` depois que ela já reservou
  saldo em `wallet.balance.unAvailable` e gerou ledger, nada reverte essas
  entradas.
- **Ledger fora da transação Mongo do controller**: `postLedgerEntries`
  abre sua própria `session`, então um abort do controller não desfaz um
  ledger já commitado.
- **Sem liberação automática de saldo retido**: `wallet.balance.unAvailable[].availableIn`
  define quando o saldo poderia ser liberado, mas não há cron/job que faça
  isso — a única rota que faria manualmente (`release.routes.ts`) está
  desmontada.
- **`User.split.cashIn` é um campo morto**: só `Seller.split.cashIn` afeta
  o cálculo real de taxa; editar via `PATCH /api/users/:id/split` não tem
  efeito algum.
- **Código nunca montado, mantido por ora**: `routes/retention.routes.ts`,
  `routes/release.routes.ts`, `config/reflowpay.ts`, `config/integration.ts`,
  `src/index.ts`.
- **`Transaction.mode` sem backfill**: registros criados antes desta
  mudança não têm o campo `mode` setado — não aparecem em listagens
  filtradas por modo via `/v1/payments`. Baixo impacto hoje (ambiente ainda
  é dev local), mas relevante se este dado for migrado para produção sem
  um script de backfill.

## Pendente para produção

- Deploy (fora de escopo desta iniciativa — ver `CLAUDE.md`: não usar Railway).
- Credenciais de produção (Zendry/Pagar.me live, `SECRET_TOKEN` forte, etc.) — nunca commitadas, `.env.example` documenta as chaves esperadas.
- Domínio real da API pública (hoje `localhost:3000`, spec/`openapi.yaml` usa um domínio ilustrativo).
- Página de dashboard para gerenciar webhook endpoints (backend pronto, UI não construída).
- Decisão e implementação de tokenização de cartão, se o time decidir reduzir o escopo PCI SAQ D no futuro.
- `payment.expired` e estorno real, se/quando forem priorizados.

## Documentação da API

Ver [`docs/README.md`](./README.md) para o índice completo (introdução,
autenticação, erros, idempotência, webhooks, guias por método de
pagamento) e [`docs/openapi.yaml`](./openapi.yaml) para a especificação
completa, navegável em `/docs` (Swagger UI, ambiente de desenvolvimento).
