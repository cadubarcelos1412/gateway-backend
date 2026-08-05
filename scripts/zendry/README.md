# Scripts de teste — integração Zendry

Todos os scripts leem as credenciais de variáveis de ambiente — nunca edite
valores direto nos arquivos. Exporte antes de rodar (ajuste os valores reais,
disponíveis em `.env.zendry.migration.local` na raiz do projeto de origem):

```bash
export ZENDRY_CLIENT_ID="..."
export ZENDRY_CLIENT_SECRET="..."
export ZENDRY_WEBHOOK_SECRET="..."
```

## O que cada teste faz e o que precisa

| Script | O que testa | Cria cobrança real? | Precisa de quê |
|---|---|---|---|
| `test-auth.mjs` | Autenticação (Basic → Bearer token) | Não | Client ID/Secret |
| `test-pix-create.mjs` | Criação de Pix (R$ 1,00) | **Sim** — QR real de R$1,00, ninguém precisa pagar | Client ID/Secret |
| `test-webhook.mjs` | Simula uma notificação de webhook chegando no SEU endpoint | Não (não fala com a Zendry, só testa seu próprio código) | Endpoint local/deployado rodando |
| `test-card-create.mjs` | Criação de pagamento de cartão | **Sim, cobrança real** — só rode com um cartão de teste de baixo valor e autorização explícita | Client ID/Secret + dados de um cartão real + `threeds_data` já obtido no navegador (não dá pra simular 3DS por script, ver nota no arquivo) |
| `test-crypto-quote.mjs` | Cotação USDT/BRL | Não | Client ID/Secret |
| `test-crypto-wallet-create.mjs` | Cria uma wallet USDT | Cria um recurso permanente na Zendry (não é dinheiro, mas não é descartável) — rode só UMA vez pra configurar a wallet-tesouro | Client ID/Secret |
| `probe-threeds.mjs` | Cria uma sessão 3DS (`POST /v1/card_payments/threeds`) | Não — só inicia a sessão, não cobra nada | Client ID/Secret. Schema de `payment_form` já confirmado no arquivo (descoberto por sondagem em 2026-08-05, não está em doc pública da Zendry) |
| `check-webhooks.mjs` | Consulta webhooks registrados (`GET /v1/webhooks*`) | Não | Client ID/Secret. **Confirmado quebrado**: `/v1/webhooks` dá 500, `/v1/webhooks/{tipo}` dá 403 com erro de header mal formado — não dá pra confirmar/configurar webhook por aqui hoje |
| `check-pix-status.mjs <reference_code>` | Consulta status real de um Pix (tenta filtro `?reference_code=`) | Não | Client ID/Secret. **O filtro dá 500** — use `reconcile-one.mjs` em vez disso, que pagina a listagem inteira |
| `reconcile-one.mjs <reference_code> [webhook_url]` | Busca o status real na Zendry (paginando `/v1/pix/qrcodes`) e, se `paid`, entrega o evento pro NOSSO webhook (`applyZendryPaymentStatus`) — corrige uma transação específica presa em `pending` | Não cria nada, só corrige status/ledger via código real | Client ID/Secret + `ZENDRY_WEBHOOK_SECRET`. Ver `zendryReconciliation.service.ts` pra correção automática/periódica |

**Não existe endpoint de saque cripto testável por script** —
`sendUsdtPayment`/`POST /v1/crypto/payments` move USDT de verdade e é
irreversível; testar exige a wallet-tesouro já fundeada e rodar o endpoint
real do seller (`POST /api/cashouts/request/usdt`) com valor baixo e
aprovação explícita, mesmo padrão já usado pro Pix/cartão reais.

**Não existe ambiente de sandbox confirmado para esta API** — todo teste que
"cria" algo (Pix, cartão) acontece contra a API de **produção** de verdade.
Use valores baixos (R$ 1,00) e, no caso de cartão, só rode com autorização
explícita do dono da conta.

## O que só dá pra confirmar de outras formas

- **IP autorizado / whitelist**: não é testável por script — depende do
  painel/suporte da Zendry (ver `ZENDRY-MIGRATION.md`, seção "Configuração
  de IP").
- **Webhook chegando de verdade**: **confirmado quebrado em produção em
  2026-08-06** — nenhum webhook da Zendry chegou nesse backend, nunca
  (verificado consultando a coleção `ZendryWebhookEvent` direto). A URL de
  callback foi registrada manualmente na conta Zendry no projeto anterior
  (fora do código) e nunca foi atualizada pra apontar pra este deploy.
  `check-webhooks.mjs` tentou consultar/confirmar isso pela API da Zendry e
  os endpoints de gerenciamento de webhook estão retornando erro (ver
  tabela acima) — provavelmente só dá pra corrigir via suporte/painel da
  Zendry diretamente. Enquanto isso, `zendryReconciliation.service.ts` roda
  a cada 10min como rede de segurança (consulta a Zendry direto pelas Pix
  "pending" antigas). `test-webhook.mjs` só simula a CHEGADA no seu código,
  não substitui um teste ponta a ponta real.
- **Desafio 3DS completo**: exige um navegador de verdade com um cartão real
  e interação do banco emissor — não é simulável por script/curl.
