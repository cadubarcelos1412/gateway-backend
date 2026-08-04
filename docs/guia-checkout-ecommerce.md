# Guia: plugando num checkout de e-commerce

Visão geral de como encaixar a PYX Gate no fluxo de compra do seu site,
independente da stack (Node, PHP, Python, etc.) — hoje, na prática, isso
significa **Pix** (veja o aviso em [guia-cartao.md](./guia-cartao.md)).

## Fluxo recomendado

```
Comprador finaliza carrinho no seu site
        │
        ▼
Seu backend cria o pedido (status: aguardando_pagamento)
        │
        ▼
Seu backend chama POST /v1/payments (server-side, com sua secret key)
        │
        ▼
Você recebe qr_code / qr_code_base64 e exibe pro comprador
        │
        ▼
Comprador paga o Pix (fora do seu site, no app do banco)
        │
        ▼
PYX Gate envia webhook payment.paid pro seu endpoint
        │
        ▼
Seu backend verifica a assinatura, marca o pedido como pago,
libera acesso/produto, dispara e-mail de confirmação
```

**Ponto importante**: a criação da cobrança (`POST /v1/payments`) deve ser
feita **pelo seu backend**, nunca pelo navegador do comprador — sua secret
key não pode ser exposta no frontend. O frontend só recebe de volta o
`qr_code`/`qr_code_base64` que o seu backend repassa.

## 1. Criar o pedido no seu sistema

Antes de chamar a PYX Gate, crie o registro do pedido no seu banco com um
identificador (`order_id`) — você vai usar esse ID em `metadata` para
conseguir religar o webhook ao pedido certo depois.

## 2. Criar a cobrança

```js
// seu backend (Node.js, exemplo)
const response = await fetch("https://api.pyxgate.com/v1/payments", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.PYX_SECRET_KEY}`,
    "Idempotency-Key": `pedido-${order.id}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    amount: order.totalCentavos,
    payment_method: "pix",
    customer: {
      name: order.customer.name,
      email: order.customer.email,
      document: order.customer.document,
    },
    metadata: { order_id: String(order.id) },
  }),
});

const payment = await response.json();
await db.orders.update(order.id, { pyxPaymentId: payment.id, status: "aguardando_pagamento" });
```

Devolva `qr_code` e `qr_code_base64` pro frontend do seu checkout — não o
`payment.id` inteiro nem qualquer outro dado sensível além do necessário
pra exibir o Pix.

## 3. Exibir o Pix no seu checkout

Sem dependência de biblioteca: uma `<img>` com a base64 e um campo de texto
com o copia-e-cola. Adicione um polling leve (opcional) para o seu próprio
backend consultar o status do pedido a cada alguns segundos, como fallback
visual enquanto o webhook não chega — mas quem **decide** que o pedido foi
pago é sempre o webhook, nunca o polling do frontend.

## 4. Cadastrar e tratar o webhook

Veja [webhooks.md](./webhooks.md) para o código completo de verificação de
assinatura. O handler típico:

```js
app.post("/webhooks/pyxgate", express.raw({ type: "application/json" }), async (req, res) => {
  const valid = verifyPyxSignature(req.body.toString("utf8"), req.headers["pyx-signature"], WEBHOOK_SECRET);
  if (!valid) return res.status(400).send("invalid signature");

  const event = JSON.parse(req.body.toString("utf8"));

  if (event.type === "payment.paid") {
    const orderId = event.data.object.metadata?.order_id;
    if (orderId) {
      await db.orders.update(orderId, { status: "pago" });
      await sendConfirmationEmail(orderId);
    }
  }

  if (event.type === "payment.failed") {
    const orderId = event.data.object.metadata?.order_id;
    if (orderId) await db.orders.update(orderId, { status: "pagamento_falhou" });
  }

  res.status(200).send("ok");
});
```

Responda `200` rápido — trate qualquer coisa demorada (e-mail, integração
com estoque, etc.) de forma assíncrona depois de responder.

## 5. Testar o fluxo inteiro sem sair do ar

Com uma chave `sk_test_...`, repita os passos 1–4 normalmente e substitua
"comprador paga o Pix de verdade" por
`POST /v1/test/payments/:id/pay` — veja [guia-pix.md](./guia-pix.md) para o
passo a passo detalhado. Isso permite testar a integração completa
(criação → webhook → liberação do pedido) sem mover dinheiro real e sem
depender de ninguém escanear um QR code de verdade.

## Checklist antes de ir pra produção

- [ ] Cobrança é criada pelo seu backend, nunca pelo navegador do comprador.
- [ ] Secret key só existe em variável de ambiente do servidor, nunca no frontend.
- [ ] Webhook endpoint verifica a assinatura `PYX-Signature` antes de confiar no payload.
- [ ] Quem marca o pedido como pago é o webhook, não o polling do frontend.
- [ ] Handler do webhook é idempotente (pode receber o mesmo evento mais de uma vez).
- [ ] `Idempotency-Key` usado na criação da cobrança, para evitar duplicidade em retry.
- [ ] Testado em modo teste de ponta a ponta antes de trocar pra chave `live`.
