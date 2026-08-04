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

**Não existe ambiente de sandbox confirmado para esta API** — todo teste que
"cria" algo (Pix, cartão) acontece contra a API de **produção** de verdade.
Use valores baixos (R$ 1,00) e, no caso de cartão, só rode com autorização
explícita do dono da conta.

## O que só dá pra confirmar de outras formas

- **IP autorizado / whitelist**: não é testável por script — depende do
  painel/suporte da Zendry (ver `ZENDRY-MIGRATION.md`, seção "Configuração
  de IP").
- **Webhook chegando de verdade**: só é testável com a URL do seu endpoint
  publicamente acessível (não `localhost`) e registrada na conta Zendry —
  `test-webhook.mjs` só simula a CHEGADA no seu código, não substitui um
  teste ponta a ponta real.
- **Desafio 3DS completo**: exige um navegador de verdade com um cartão real
  e interação do banco emissor — não é simulável por script/curl.
