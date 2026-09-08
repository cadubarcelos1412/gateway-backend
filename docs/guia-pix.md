# Guia: Pix, do zero ao pedido liberado

Passo a passo completo: criar cobrança → exibir QR code → receber
confirmação por webhook → liberar o pedido. Exemplos em `curl` e Node.js,
em modo teste (não precisa de dinheiro real para testar o fluxo inteiro).

## 1. Gere uma chave de teste

Dashboard → Desenvolvedores → Nova chave → tipo `secret`, modo `teste`.
Copie a chave `sk_test_...` (só aparece uma vez).

> **Valor mínimo:** Pix abaixo de R$ 5,00 (`amount` menor que `500`) é
> recusado com `amount_below_minimum` — limite observado do lado da
> adquirente, não documentado oficialmente por ela, então pode mudar sem
> aviso prévio.

> **Cobrar Pix só com telefone (sem email/documento):** por padrão,
> `customer.email` e `customer.document` são obrigatórios. Se a sua oferta
> só coleta telefone (ex.: QR code dinâmico numa landing page, sem
> formulário completo), a PYX Gate pode liberar `customer.phone` como
> alternativa pra sua conta — fale com o suporte para ativar. Sem essa
> liberação, enviar só `phone` retorna `pix_phone_only_not_authorized`. Veja
> [erros.md](./erros.md).

## 2. Crie a cobrança

```bash
curl -X POST http://localhost:3000/v1/payments \
  -H "Authorization: Bearer sk_test_..." \
  -H "Idempotency-Key: pedido-1001" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1990,
    "payment_method": "pix",
    "customer": {
      "name": "Maria Compradora",
      "email": "maria@example.com",
      "document": "39053344705"
    },
    "metadata": { "order_id": "1001" }
  }'
```

```js
// Node.js
const res = await fetch("http://localhost:3000/v1/payments", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk_test_...",
    "Idempotency-Key": "pedido-1001",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    amount: 1990,
    payment_method: "pix",
    customer: { name: "Maria Compradora", email: "maria@example.com", document: "39053344705" },
    metadata: { order_id: "1001" },
  }),
});
const payment = await res.json();
```

Com a conta autorizada pra Pix só com telefone (ver nota acima), o mesmo
`customer` pode vir só com `name` e `phone`:

```json
{
  "amount": 1990,
  "payment_method": "pix",
  "customer": { "name": "Maria Compradora", "phone": "11999998888" },
  "metadata": { "order_id": "1001" }
}
```

Resposta (`201`):

```json
{
  "id": "pay_6a714eb5b03f4c85d1b52f39",
  "status": "pending",
  "payment_method": "pix",
  "mode": "test",
  "qr_code": "00020126...",
  "qr_code_base64": "iVBORw0KGgo...",
  "amount": 1990
}
```

## 3. Exiba o QR code

- `qr_code_base64` — imagem PNG em base64, exiba direto num `<img src="data:image/png;base64,...">`.
- `qr_code` — payload "copia e cola" (Pix Copia e Cola), exiba num campo de texto com botão copiar.

Em modo teste, o QR code é simulado (não é um Pix real escaneável) — serve
para testar a integração visual e o fluxo de dados.

## 4. Cadastre um webhook para saber quando foi pago

```bash
curl -X POST http://localhost:3000/v1/webhook_endpoints \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{"url": "https://seusite.com/webhooks/pyxgate", "events": ["payment.paid", "payment.failed"]}'
```

Veja [webhooks.md](./webhooks.md) para o código de verificação de
assinatura.

## 5. Simule a confirmação (só em modo teste)

Em produção, isso acontece sozinho quando o comprador paga o Pix de
verdade. Em modo teste, você simula:

```bash
curl -X POST http://localhost:3000/v1/test/payments/pay_6a714eb5b03f4c85d1b52f39/pay \
  -H "Authorization: Bearer sk_test_..."
```

Isso muda o status para `paid` e dispara o webhook `payment.paid` — se você
cadastrou um endpoint no passo 4, ele recebe o evento agora.

Para simular uma falha em vez de sucesso, use `/fail` no lugar de `/pay`.

## 6. Confirme consultando o pagamento

```bash
curl http://localhost:3000/v1/payments/pay_6a714eb5b03f4c85d1b52f39 \
  -H "Authorization: Bearer sk_test_..."
```

```json
{ "id": "pay_6a714eb5b03f4c85d1b52f39", "status": "paid", ... }
```

## 7. Libere o pedido

No seu handler do webhook `payment.paid` (depois de verificar a
assinatura), marque o pedido correspondente (via `metadata.order_id`, que
você mesmo definiu na criação) como pago e libere o acesso/produto.

## Indo para produção

1. Gere uma chave `sk_live_...` (mesma tela, modo produção).
2. Cadastre um webhook endpoint `https://` de produção.
3. Não há mais passo de "simular" — o pagamento muda de status sozinho
   quando o Pix é pago de verdade.
