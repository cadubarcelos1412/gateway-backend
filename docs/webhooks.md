# Webhooks

Webhooks avisam seu sistema em tempo real quando algo muda — o caso mais
comum é saber quando um Pix foi pago, já que o pagador confirma fora do
seu site.

## Cadastrando um endpoint

```bash
curl -X POST https://pyxgate-api.onrender.com/v1/webhook_endpoints \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seusite.com/webhooks/pyxgate",
    "events": ["payment.paid", "payment.failed"]
  }'
```

Resposta:

```json
{
  "id": "we_654a1f2b3c4d5e6f70718293",
  "url": "https://seusite.com/webhooks/pyxgate",
  "events": ["payment.paid", "payment.failed"],
  "secret": "whsec_3db8e231bed98fd94824c16d49b729521fb628f06586e5eb",
  "active": true,
  "createdAt": "2026-08-04T02:30:08.683Z"
}
```

**Guarde o `secret` (`whsec_...`)** — ele é retornado na criação e na
listagem, e é o que você usa para verificar que um webhook realmente veio
da PYX Gate (veja abaixo). Em produção, `url` precisa ser `https://`; em
desenvolvimento local, `http://` é aceito para você testar contra um
listener local.

Também é possível cadastrar pelo dashboard, em Desenvolvedores.

## Eventos disponíveis

| Evento | Quando dispara |
|---|---|
| `payment.created` | Um pagamento foi criado (ainda pendente). |
| `payment.paid` | Um pagamento foi confirmado. |
| `payment.failed` | Um pagamento falhou ou foi rejeitado. |
| `payment.expired` | Reservado — ainda não é disparado (não existe expiração automática de cobrança no gateway hoje). |
| `refund.succeeded` | Reservado — ainda não é disparado (estornos não estão implementados, ver [erros.md](./erros.md)). |

Use `events: ["*"]` para receber todos os eventos implementados.

## Formato do evento

```json
{
  "id": "evt_72e8fea8b30077bde17a0e59",
  "type": "payment.paid",
  "created": 1785810633,
  "data": {
    "object": {
      "id": "pay_6a714eb5b03f4c85d1b52f39",
      "amount": 1990,
      "status": "paid",
      "payment_method": "pix",
      "mode": "test"
    }
  }
}
```

`data.object` é o mesmo shape retornado por `GET /v1/payments/:id`.

## Verificando a assinatura

Toda entrega inclui o header `PYX-Signature`:

```
PYX-Signature: t=1785810633,v1=ff5341a26468d81db9ba568f3185ae0a251cf7d1efe6bdab3a9432719e810b10
```

- `t` — timestamp Unix (segundos) de quando a entrega foi assinada.
- `v1` — `HMAC-SHA256(secret, "{t}.{corpo_bruto_da_requisicao}")`, em hex.

**Sempre verifique a assinatura antes de confiar no payload** — qualquer um
pode enviar um POST para sua URL forjando o corpo. Recompute o HMAC com seu
`secret` e compare em tempo constante.

### Node.js

```js
const crypto = require("crypto");

function verifyPyxSignature(rawBody, signatureHeader, secret) {
  const [tPart, v1Part] = signatureHeader.split(",");
  const timestamp = tPart.split("=")[1];
  const receivedSignature = v1Part.split("=")[1];

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(receivedSignature, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Express: use express.raw() nessa rota para ter o corpo bruto (não parseado).
app.post("/webhooks/pyxgate", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.headers["pyx-signature"];
  const ok = verifyPyxSignature(req.body.toString("utf8"), signature, process.env.PYX_WEBHOOK_SECRET);

  if (!ok) return res.status(400).send("Assinatura inválida");

  const event = JSON.parse(req.body.toString("utf8"));
  if (event.type === "payment.paid") {
    // libere o pedido
  }

  res.status(200).send("ok");
});
```

### PHP

```php
<?php
function verifyPyxSignature(string $rawBody, string $signatureHeader, string $secret): bool {
    $parts = [];
    foreach (explode(",", $signatureHeader) as $part) {
        [$key, $value] = explode("=", $part, 2);
        $parts[$key] = $value;
    }

    $timestamp = $parts["t"] ?? "";
    $receivedSignature = $parts["v1"] ?? "";

    $expected = hash_hmac("sha256", "{$timestamp}.{$rawBody}", $secret);

    return hash_equals($expected, $receivedSignature);
}

$rawBody = file_get_contents("php://input");
$signature = $_SERVER["HTTP_PYX_SIGNATURE"] ?? "";
$secret = getenv("PYX_WEBHOOK_SECRET");

if (!verifyPyxSignature($rawBody, $signature, $secret)) {
    http_response_code(400);
    exit("Assinatura inválida");
}

$event = json_decode($rawBody, true);
if ($event["type"] === "payment.paid") {
    // libere o pedido
}

http_response_code(200);
```

## Retentativas

Se seu endpoint não responder `2xx`, a entrega é tentada novamente até 4
vezes (imediata, +10s, +1min, +5min). Depois disso, a entrega é dada como
falha — não há fila de retry manual nem replay automático depois disso.
**Responda `200` rapidamente e processe de forma assíncrona** se a lógica
do seu lado for demorada, para não acumular tentativas por timeout.

## Idempotência do seu lado

Como pode haver retentativas, seu endpoint pode receber o mesmo `evt_...`
mais de uma vez. Trate o processamento do evento como idempotente (ex.:
`if (pedido.status === "pago") return;` antes de liberar de novo).

## Testando localmente

Em modo teste, dispare `payment.paid`/`payment.failed` manualmente via
`POST /v1/test/payments/:id/pay` (ou `/fail`) — veja
[guia-pix.md](./guia-pix.md). Isso aciona a entrega real do webhook,
assinado da mesma forma que em produção.
