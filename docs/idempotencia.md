# Idempotência

Redes falham, timeouts acontecem e clientes fazem retry. Sem cuidado, isso
pode gerar uma cobrança duplicada. O header `Idempotency-Key` resolve isso.

## Como usar

Envie um valor único por operação (ex.: o ID do pedido no seu sistema) no
header `Idempotency-Key` em requisições `POST`:

```bash
curl -X POST https://api.pyxgate.com/v1/payments \
  -H "Authorization: Bearer sk_test_..." \
  -H "Idempotency-Key: pedido-8f3a21" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1990,
    "payment_method": "pix",
    "customer": {"name": "Maria", "email": "maria@example.com", "document": "39053344705"}
  }'
```

Se a requisição falhar por timeout e você reenviar com a **mesma**
`Idempotency-Key` e o **mesmo** corpo, a API retorna a resposta original,
sem criar uma segunda cobrança.

## Regras

- **Mesma chave + mesmo payload** → retorna a resposta já registrada (mesmo
  status HTTP e corpo da primeira vez), sem reprocessar.
- **Mesma chave + payload diferente** → `400 idempotency_key_reused`. Isso
  geralmente indica um bug no seu código (reaproveitando uma chave para uma
  operação diferente) — gere uma chave nova por operação.
- **TTL de 24 horas** — depois disso a chave "expira" e pode ser reutilizada
  livremente (o registro é removido automaticamente).
- Escopo por conta: a mesma `Idempotency-Key` usada por merchants diferentes
  não colide entre si.

## Onde é suportado

Hoje, `POST /v1/payments`. Outras rotas de escrita (webhook endpoints, por
exemplo) ainda não suportam o header — se isso for necessário para o seu
caso de uso, peça.

## Recomendação prática

Use um identificador que já existe no seu sistema (ID do pedido, ID do
carrinho) em vez de gerar um UUID aleatório a cada tentativa — assim,
retries automáticos do seu HTTP client já reaproveitam a mesma chave sem
esforço extra.
