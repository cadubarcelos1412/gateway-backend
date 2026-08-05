# Guia: Cartão

## Antes de integrar

Cartão exige um desafio 3DS completo no navegador do comprador — não existe
sandbox pra isso, e o fluxo passa pelo SDK client-side da própria Zendry.
Duas coisas importantes:

1. **Compliance PCI**: o número, validade e CVV do cartão trafegam
   diretamente no corpo de `POST /v1/payments` — passam pelo nosso backend
   antes de chegar na adquirente (Zendry). Isso coloca **você** no escopo de
   responsabilidade PCI-DSS equivalente a manipular dados de cartão
   diretamente. Não há tokenização client-side disponível hoje.
2. **O token de autenticação 3DS fica exposto no navegador do comprador**:
   `GET /v1/card_authentications/token` devolve o mesmo Bearer token que
   autentica toda a comunicação da PYX Gate com a Zendry (não é escopado só
   pra 3DS). É assim que o SDK oficial da Zendry funciona — decisão
   consciente, aceita pelo time da PYX Gate.

**Só funciona para sellers com adquirente `zendry`.**

## Passo a passo

### 1. Pegue o token de autenticação (backend do integrador)

```bash
curl https://pyxgate-api.onrender.com/v1/card_authentications/token \
  -H "Authorization: Bearer sk_live_..."
```

```json
{ "token": "eyJhbGciOiJSUzI1NiIs..." }
```

Chame isso do **seu servidor**, nunca do navegador — é aqui que a chave
secreta é usada. Passe o `token` retornado pro seu frontend.

### 2. Rode o desafio 3DS no navegador (frontend do integrador)

Carregue o SDK da Zendry:

```html
<script src="https://cdn.zendry.com/v1/zendry-sdk-threeds.min.js"></script>
```

```js
ZendrySDKThreeds.init_threeds({
  token: tokenDoServidor, // obtido no passo 1
  amount: 15000, // centavos — mesmo valor que você vai cobrar depois
  payment_form: {
    pan: "4242424242424242",
    expiry_month: "12",
    expiry_year: "29", // 2 dígitos! "2029" é rejeitado
    card_holder_name: "MARIA COMPRADORA",
    account_type: "CREDIT", // ou "DEBIT"
    network_preference: "VISA", // "VISA" | "MASTERCARD" | "AMEX" | "ELO" | "DINERS" | "CB" — detecte pelo BIN do cartão
  },
  onSuccess: (result) => {
    // result.three_ds_data = { operation_session_id, xid, eci, cavv,
    //   secure_version, directory_server_transaction_id,
    //   three_ds_server_transaction_id }
  },
  onFailure: (result) => { /* desafio recusado */ },
  onError: (error) => { /* erro técnico */ },
});
```

O SDK cria a sessão 3DS, roda o desafio visual (widget da Lyra, provedor por
trás da Zendry) e devolve `three_ds_data` com 7 dos 13 campos que
`threeds_data` exige. **O SDK não cobra nada nem move dinheiro** — só
autentica o cartão.

### 3. Complete `threeds_data` com fingerprint do navegador

Os outros 6 campos exigidos por `POST /v1/payments` **não vêm do SDK** —
colete direto do navegador:

```js
const threeds_data = {
  ...result.three_ds_data,
  ip_address: /* IP do comprador — obtenha no seu backend, não é confiável vindo do navegador */,
  user_agent_browser_value: navigator.userAgent,
  http_browser_language: navigator.language,
  http_browser_screen_height: String(screen.height),
  http_browser_screen_width: String(screen.width),
  zip_code: /* CEP de cobrança do comprador */,
};
```

### 4. Cobre de verdade

```bash
curl -X POST https://pyxgate-api.onrender.com/v1/payments \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 15000,
    "payment_method": "card",
    "customer": { "name": "Maria Compradora", "email": "maria@example.com", "document": "39053344705" },
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

## Modo teste

Em **modo teste** (`sk_test_...`), `threeds_data` ainda é exigido pela
validação do payload, mas seu conteúdo não é verificado de verdade (nenhuma
chamada à Zendry acontece em modo teste) — envie qualquer objeto não vazio.
A cobrança nasce `pending` e você a confirma via
`POST /v1/test/payments/:id/pay`, igual ao fluxo Pix. Isso quer dizer que
você pode testar o passo 4 sem rodar o desafio 3DS de verdade — só não
valida se o SEU fluxo de 3DS (passos 1–3) está correto.

## Referência: schema de `payment_form`

Confirmado por sondagem empírica contra produção (a Zendry não documenta
isso publicamente) — ver `scripts/zendry/probe-threeds.mjs` no backend.

| Campo | Tipo | Observação |
|---|---|---|
| `pan` | string | Número completo do cartão |
| `expiry_month` | string | `"01"`–`"12"` |
| `expiry_year` | string | **2 dígitos** (`"29"`, não `"2029"`) |
| `card_holder_name` | string | |
| `account_type` | `"CREDIT"` \| `"DEBIT"` | Maiúsculo |
| `network_preference` | `"VISA"` \| `"MASTERCARD"` \| `"AMEX"` \| `"ELO"` \| `"DINERS"` \| `"CB"` | Maiúsculo. `"HIPERCARD"` foi testado e rejeitado |

CVV não entra em `payment_form` — só na cobrança final (passo 4).
