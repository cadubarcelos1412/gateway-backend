# MCP — conectando agentes de IA à PYX Gate

O **MCP (Model Context Protocol)** é o padrão que permite que um assistente
de IA — Claude, Cursor, n8n, seu próprio agente — use ferramentas externas.
O servidor MCP da PYX Gate expõe a API `/v1` como um conjunto de
ferramentas, para que um agente consiga criar uma cobrança Pix, consultar um
pagamento ou cadastrar um webhook conversando em português.

Não é uma API nova: é a mesma `/v1` documentada aqui, com outra embalagem.
Tudo que vale para a API (valores em centavos, modo teste isolado,
idempotência, escopo por credencial) vale igual no MCP.

> **Onde isso é útil:** integrar seu checkout com a ajuda de um agente de
> código, deixar seu time de suporte consultar pagamentos em linguagem
> natural, ou automatizar cobranças dentro de um fluxo de agente.

---

## Instalando

A PYX Gate distribui o servidor MCP pela **própria infraestrutura**, não por
registry público. Um comando:

```bash
# macOS / Linux
curl -fsSL https://pyxgate-api.onrender.com/install.sh | sh
```

```powershell
# Windows
irm https://pyxgate-api.onrender.com/install.ps1 | iex
```

O instalador baixa o pacote, **confere o SHA-256 contra o manifesto**
publicado em `/dist/manifest.json` e só então instala — se o arquivo servido
não bater com o checksum, ele aborta sem instalar nada. Se o Claude Code
estiver na máquina, o MCP já é registrado automaticamente.

> Por que checksum: `curl | sh` executa o que o servidor mandar. HTTPS
> protege o caminho, não o conteúdo. A verificação de integridade é o que
> transforma isso numa instalação confiável.

### Conectando sem instalar nada

O servidor é hospedado — dá pra apontar direto:

```bash
claude mcp add --transport http pyxgate https://pyxgate-mcp.onrender.com/mcp
```

Na primeira chamada o cliente abre o navegador na tela de autorização da
PYX Gate. Você entra com seu login de seller, **escolhe o ambiente** (teste
ou produção) e marca quais permissões concede. Não é preciso criar nem colar
nenhuma chave de API.

---

## Autorização: OAuth 2.1

O MCP **não usa chave de API**. Usa OAuth 2.1 com PKCE, seguindo a
especificação de autorização do MCP. Motivo: uma chave `sk_` é tudo-ou-nada
e vive para sempre em um arquivo de configuração. Um agente de IA lê texto
de terceiros (e-mails, páginas, planilhas) e por isso precisa de uma
credencial **de escopo reduzido, com prazo, revogável e presa a um
ambiente**.

| Peça | Como funciona |
|---|---|
| **Descoberta** | `GET /.well-known/oauth-protected-resource` no servidor MCP aponta para o Authorization Server; `GET /.well-known/oauth-authorization-server` na API lista os endpoints. O cliente acha tudo sozinho. |
| **Registro** | Dynamic Client Registration (RFC 7591). O cliente MCP se registra sozinho em `POST /oauth/register`. Nada para cadastrar à mão. |
| **PKCE** | Obrigatório, só `S256`. Cliente MCP é público (roda na máquina do usuário) e não guarda segredo. |
| **Consentimento** | Tela da PYX Gate: login do seller, escolha de ambiente e checkboxes por permissão. |
| **Access token** | JWT assinado em **HMAC-SHA256**, válido por 1 hora, preso a um `resource` (audiência) específico. |
| **Refresh token** | 30 dias, **uso único com rotação**. Guardado só como hash SHA-256. |
| **Revogação em cascata** | Reutilizar um código de autorização ou um refresh token indica vazamento: todas as sessões daquela aplicação são derrubadas na hora. |

### Sobre HMAC, SHA-256 e Argon2

Uma pergunta que sempre aparece: por que HMAC e não Argon2?

São primitivas para problemas diferentes. **Argon2 e bcrypt são KDFs lentas
de propósito**, feitas para proteger segredo de *baixa entropia* — senha
humana — contra força bruta offline. É por isso que o login de usuário da
PYX Gate usa bcrypt, e continua usando.

Um access token ou um refresh token nosso tem **256 bits de entropia
aleatória**. Força bruta é inviável por construção, e o que se precisa aí é
outra coisa:

- **Integridade verificável sem ida ao banco** → HMAC-SHA256 (HS256) no
  access token. Cada requisição valida assinatura, emissor, validade e
  audiência em memória.
- **Comparação em tempo constante do que está no banco** → SHA-256 +
  `timingSafeEqual` para código de autorização, refresh token e
  `client_secret` — exatamente o que as chaves `sk_` já usam.

Usar Argon2 aqui adicionaria uma dependência nativa e latência por
requisição, sem ganhar segurança nenhuma.

---

## Permissões (escopos)

O token carrega só o que foi marcado na tela de consentimento. Uma chamada
sem o escopo necessário recebe `403 insufficient_scope`.

| Escopo | Permite |
|---|---|
| `account:read` | Ver dados da conta e o ambiente ativo |
| `payments:read` | Consultar e listar pagamentos |
| `payments:write` | **Criar cobranças Pix** |
| `webhooks:read` | Ver endpoints de webhook |
| `webhooks:write` | Criar, alterar e remover endpoints |
| `test:write` | Simular pagamentos em modo teste |

> **Recomendação:** para agentes, conceda `payments:write` apenas em modo
> **teste**, a menos que você realmente queira que o agente crie cobranças
> reais. O ambiente é escolhido no consentimento e fica gravado no token —
> não é um parâmetro que o agente possa mudar sozinho depois.

Chaves `sk_` já existentes continuam funcionando sem mudança nenhuma: elas
carregam escopo `*`.

---

## Ferramentas disponíveis

| Ferramenta | Escopo | O que faz |
|---|---|---|
| `criar_cobranca_pix` | `payments:write` | Cria a cobrança e devolve **o QR Code como imagem** + o copia-e-cola |
| `consultar_pagamento` | `payments:read` | Status de um pagamento (consulta a adquirente ao vivo se pendente) |
| `listar_pagamentos` | `payments:read` | Lista com filtro de status e período |
| `consultar_conta` | `account:read` | Dados do merchant e o ambiente da sessão |
| `simular_pagamento` | `test:write` | Marca uma cobrança de teste como paga ou falha |
| `listar_webhooks` | `webhooks:read` | Endpoints cadastrados e eventos assinados |
| `criar_webhook` | `webhooks:write` | Cadastra endpoint e devolve o secret de assinatura |
| `atualizar_webhook` | `webhooks:write` | Altera URL, eventos ou liga/desliga |
| `remover_webhook` | `webhooks:write` | Remove um endpoint |

Cada ferramenta declara anotações (`readOnlyHint`, `destructiveHint`) para
que o cliente MCP saiba quando pedir confirmação ao usuário antes de agir.

**Cartão não é exposto como ferramenta.** Criar pagamento com cartão exige
`threeds_data`, que só existe depois do desafio 3DS rodar no navegador do
comprador (ver [guia-cartao.md](./guia-cartao.md)). Um agente não tem como
produzir esse dado — e uma ferramenta que sempre falha é pior que ferramenta
nenhuma.

---

## Roteiros prontos (prompts)

Além das ferramentas, o servidor expõe roteiros que o cliente MCP mostra
como comandos:

| Roteiro | Para quê |
|---|---|
| `integrar_checkout_pix` | Conduz a integração completa na sua stack: cobrança → QR → webhook com verificação HMAC → simulação → liberação do pedido |
| `diagnosticar_pagamento` | Investiga uma cobrança que não confirmou e aponta a causa |
| `checklist_producao` | Confere o que falta antes de sair do modo teste |

---

## Exemplo: criando uma cobrança por conversa

> **Você:** cria uma cobrança de R$ 29,90 pra Maria, CPF 390.533.447-05

O agente chama `criar_cobranca_pix` e responde com o QR Code renderizado e:

```
Cobrança pay_6aa196a53fa6def043a2a63a criada — R$ 29,90 — status pending — modo test.
⚠️ Modo teste: este QR não é pagável de verdade.

Pix copia e cola:
00020126TESTMODE...
```

Em modo teste, `simular_pagamento` fecha o ciclo e dispara o webhook —
mesmo fluxo do [guia-pix.md](./guia-pix.md), sem escrever código.

---

## Rodando o servidor MCP você mesmo

O servidor é um processo separado da API: ele não tem acesso ao banco nem ao
segredo de assinatura, só repassa o token para a `/v1`. Isso é proposital —
comprometer o MCP não compromete o gateway.

```bash
cd mcp
npm install
PYXGATE_API_URL=https://pyxgate-api.onrender.com \
MCP_PUBLIC_URL=https://pyxgate-mcp.onrender.com/mcp \
PORT=3333 npm start
```

| Variável | Onde | Para quê |
|---|---|---|
| `PYXGATE_API_URL` | MCP | Base da API (sem `/v1`) |
| `MCP_PUBLIC_URL` | MCP | URL pública deste servidor — é a **audiência** do token |
| `MCP_RESOURCE_URL` | API | Lista (CSV) de recursos aceitos. **Precisa conter o `MCP_PUBLIC_URL`**, senão todo token é recusado com `invalid_token` |
| `BASE_URL` | API | Usada nos documentos `.well-known` |

O erro mais comum na primeira instalação é justamente essa: `MCP_PUBLIC_URL`
e `MCP_RESOURCE_URL` divergentes. O token é emitido para um recurso e
validado contra outro.

### Verificando a instalação

```bash
cd mcp
npm test                                        # protocolo MCP, tools, QR, 401 + descoberta
GATEWAY_URL=http://127.0.0.1:3000 node oauth-e2e.mjs   # fluxo OAuth completo
```

O `oauth-e2e.mjs` precisa de um gateway apontando para um banco de
**desenvolvimento** (ele cria clientes e faz login com o seller do seed) —
nunca rode contra produção.
