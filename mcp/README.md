# Servidor MCP da PYX Gate

Expõe a API pública `/v1` como ferramentas MCP, para que um agente de IA
(Claude, Cursor, n8n) crie cobranças Pix, consulte pagamentos e gerencie
webhooks. Transporte **Streamable HTTP**, autorização **OAuth 2.1**.

Documentação para integradores: [`../docs/mcp.md`](../docs/mcp.md).

## Desenho

```
cliente MCP ──OAuth token──> servidor MCP ──mesmo token──> gateway /v1
                                  │                            │
                        não valida token,                assina e valida
                        não fala com o banco             (SECRET_TOKEN)
```

O servidor MCP é **deliberadamente burro**: não tem o segredo de assinatura
nem acesso ao MongoDB, só repassa o Bearer para a `/v1`. Comprometer este
processo não compromete o gateway. Ele é um Resource Server OAuth — o
Authorization Server é o próprio gateway (`/oauth/*`).

## Rodando

```bash
npm install

PYXGATE_API_URL=https://pyxgate-api.onrender.com \
MCP_PUBLIC_URL=https://mcp.pyxgate.com/mcp \
PORT=3333 npm start
```

| Variável | Onde | Para quê |
|---|---|---|
| `PYXGATE_API_URL` | aqui | Base da API, sem `/v1` |
| `MCP_PUBLIC_URL` | aqui | URL pública deste servidor — vira a **audiência** do token |
| `MCP_RESOURCE_URL` | gateway | CSV de recursos aceitos; **precisa conter o `MCP_PUBLIC_URL`** |
| `PYXGATE_API_KEY` | aqui | Opcional. Chave `sk_` como fallback, só para desenvolvimento local |

> Se `MCP_PUBLIC_URL` e `MCP_RESOURCE_URL` divergirem, o token é emitido
> para um recurso e validado contra outro: toda chamada volta `401`.

## Verificando

```bash
npm test          # protocolo MCP contra uma /v1 falsa: tools, prompts, QR, 401 + descoberta
```

Para o fluxo OAuth completo é preciso um gateway rodando contra um banco de
**desenvolvimento** (o script faz login com o seller do seed):

```bash
# 1. Mongo descartável como replica set (as transações do gateway exigem)
docker run -d --rm --name pyx-dev -p 27018:27017 mongo:7 --replSet rs0 --bind_ip_all
docker exec pyx-dev mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'

# 2. Seed + gateway apontando pra ele
cd ..
export MONGO_URI="mongodb://127.0.0.1:27018/pyx-dev?replicaSet=rs0&directConnection=true"
npm run seed:dev
PORT=3010 BASE_URL=http://127.0.0.1:3010 \
MCP_RESOURCE_URL=http://127.0.0.1:4445/mcp NODE_ENV=development npm start

# 3. O fluxo inteiro
cd mcp
GATEWAY_URL=http://127.0.0.1:3010 node oauth-e2e.mjs
```

Cobre: descoberta, registro dinâmico, redirect maliciosa recusada, PKCE
(inclusive verifier errado), senha inválida, escopo negado com `403`,
cobrança criada via token, rotação de refresh e revogação em cascata.

**Nunca aponte o `oauth-e2e.mjs` para produção** — ele registra clientes e
autentica com credenciais de seed.

## Ferramentas

`criar_cobranca_pix` · `consultar_pagamento` · `listar_pagamentos` ·
`consultar_conta` · `simular_pagamento` · `listar_webhooks` ·
`criar_webhook` · `atualizar_webhook` · `remover_webhook`

Prompts: `integrar_checkout_pix` · `diagnosticar_pagamento` ·
`checklist_producao`

Cartão não é exposto: exige `threeds_data` do navegador do comprador, que um
agente não tem como produzir.
