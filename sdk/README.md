# @pyxgate/sdk

SDK oficial da [PYX Gate](https://pyxgate-api.onrender.com/docs) — cobranças
Pix e cartão, webhooks assinados, modo de testes isolado.

**Zero dependências.** Usa o `fetch` global e o `crypto` do Node (18+).

```bash
npm install @pyxgate/sdk
```

## Cobrança Pix em 6 linhas

```ts
import { PyxGate } from "@pyxgate/sdk";

const pyx = new PyxGate(process.env.PYXGATE_API_KEY!); // sk_test_... ou sk_live_...

const cobranca = await pyx.payments.create(
  {
    amount: 1990, // centavos → R$ 19,90
    payment_method: "pix",
    customer: { name: "Maria", email: "maria@exemplo.com", document: "39053344705" },
    metadata: { order_id: "1001" },
  },
  "1001" // Idempotency-Key: reenvio não gera cobrança duplicada
);

console.log(cobranca.qr_code);        // Pix copia e cola
console.log(cobranca.qr_code_base64); // PNG do QR Code
```

> Valores são **sempre inteiros em centavos**. Pix tem mínimo de 500 (R$ 5,00).

## Verificando o webhook (não pule esta parte)

Liberar pedido sem verificar assinatura significa aceitar qualquer POST que
chegue no seu endpoint como se fosse pagamento confirmado.

```ts
import express from "express";
import { constructWebhookEvent, WebhookSignatureError } from "@pyxgate/sdk";

const app = express();

// ⚠️ o corpo CRU é obrigatório — JSON.stringify(req.body) não bate na assinatura
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));

app.post("/webhooks/pyxgate", (req, res) => {
  try {
    const evento = constructWebhookEvent(
      (req as any).rawBody,
      req.header("PYX-Signature"),
      process.env.PYXGATE_WEBHOOK_SECRET!
    );

    if (evento.type === "payment.paid") {
      // idempotente: o mesmo evento pode chegar mais de uma vez
      liberarPedido(evento.data.metadata.order_id, evento.data.id);
    }
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof WebhookSignatureError) return res.sendStatus(400);
    throw err;
  }
});
```

`constructWebhookEvent` verifica HMAC-SHA256 em tempo constante e rejeita
replay fora de uma janela de 300s (configurável no 4º argumento).

## Testando de ponta a ponta, sem dinheiro real

Uma chave `sk_test_` roda na mesma URL, mas nunca chama adquirente nem move
dinheiro. A confirmação você dispara na mão:

```ts
const c = await pyx.payments.create({ amount: 1990, payment_method: "pix", customer: { name: "Maria" } });
await pyx.testPayments.pay(c.id);              // dispara o webhook payment.paid
const pago = await pyx.payments.retrieve(c.id); // status: "paid"
```

## API

| Método | O que faz |
|---|---|
| `payments.create(params, idempotencyKey?)` | Cria cobrança Pix ou cartão |
| `payments.retrieve(id)` | Consulta (checa a adquirente ao vivo se pendente) |
| `payments.list(params?)` | Lista com filtro de status e período |
| `account.retrieve()` | Dados da conta e ambiente ativo |
| `testPayments.pay(id)` / `.fail(id)` | Simula confirmação (só `sk_test_`) |
| `webhookEndpoints.create/list/update/del` | Gerencia endpoints |
| `constructWebhookEvent(...)` | Verifica assinatura e devolve o evento |

## Erros

```ts
import { PyxGateError } from "@pyxgate/sdk";

try {
  await pyx.payments.create({ amount: 100, payment_method: "pix", customer: { name: "Maria" } });
} catch (err) {
  if (err instanceof PyxGateError) {
    console.log(err.code);  // "amount_below_minimum"
    console.log(err.param); // "amount"
  }
}
```

Erros `4xx` nunca são repetidos automaticamente (repetir criação de cobrança
seria cobrar duas vezes). `5xx` e `429` têm 2 retentativas com backoff.

## Opções

```ts
new PyxGate({
  apiKey: "sk_test_...",
  baseUrl: "https://pyxgate-api.onrender.com", // padrão
  timeoutMs: 30_000,
  maxRetries: 2,
});
```

## Agentes de IA

A PYX Gate também tem servidor MCP — um agente conecta e cria cobranças
conversando: [`@pyxgate/mcp`](https://www.npmjs.com/package/@pyxgate/mcp).

## Links

- [Documentação](https://pyxgate-api.onrender.com/docs)
- [Guia de Pix](https://pyxgate-api.onrender.com/docs#guia-pix)
- [Webhooks](https://pyxgate-api.onrender.com/docs#webhooks)

MIT
