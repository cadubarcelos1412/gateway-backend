# PYX Gate API — Documentação

Documentação da API pública da PYX Gate (`/v1`) — pagamentos Pix e cartão,
webhooks, chaves de API.

## Quickstart (5 minutos)

Pré-requisito: backend rodando localmente (`npm run dev` em `gateway-clean`,
porta 3000 por padrão — veja a raiz do repo para subir o Mongo local).

### 1. Faça login e gere uma chave de teste (2 min)

Pelo dashboard (`FRONT`, rodando em `npm run dev`): login → **Desenvolvedores**
→ **Nova chave** → tipo `secret`, modo `teste` → copie a chave `sk_test_...`.

Ou via API, se você já tem um usuário seller e o JWT dele:

```bash
curl -X POST http://localhost:3000/api/developers/api-keys \
  -H "Authorization: Bearer SEU_JWT_DE_SELLER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Quickstart","type":"secret","mode":"test"}'
```

Guarde o campo `apiKey.key` da resposta — só aparece uma vez.

### 2. Crie sua primeira cobrança Pix (1 min)

```bash
curl -X POST http://localhost:3000/v1/payments \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1990,
    "payment_method": "pix",
    "customer": {"name": "Maria", "email": "maria@example.com", "document": "39053344705"}
  }'
```

Você recebe de volta `qr_code` (copia-e-cola) e `qr_code_base64` (imagem).

### 3. Simule o pagamento (1 min)

```bash
curl -X POST http://localhost:3000/v1/test/payments/SEU_PAYMENT_ID/pay \
  -H "Authorization: Bearer sk_test_..."
```

### 4. Confirme (1 min)

```bash
curl http://localhost:3000/v1/payments/SEU_PAYMENT_ID \
  -H "Authorization: Bearer sk_test_..."
```

`status` deve estar `"paid"`. Pronto — você criou e confirmou um pagamento
de ponta a ponta em modo teste, sem mover dinheiro real.

## Onde ir a partir daqui

| Documento | Conteúdo |
|---|---|
| [introducao.md](./introducao.md) | Visão geral, ambientes test/live, base URL |
| [autenticacao.md](./autenticacao.md) | Tipos de chave, geração, revogação, rotação |
| [erros.md](./erros.md) | Tabela de types/codes de erro |
| [idempotencia.md](./idempotencia.md) | Header `Idempotency-Key` |
| [webhooks.md](./webhooks.md) | Eventos, assinatura, retentativas, exemplos Node.js/PHP |
| [guia-pix.md](./guia-pix.md) | Passo a passo completo: cobrança → QR → webhook → pedido liberado |
| [guia-cartao.md](./guia-cartao.md) | Status atual da integração de cartão (leia antes de integrar) |
| [guia-checkout-ecommerce.md](./guia-checkout-ecommerce.md) | Encaixando no checkout do seu e-commerce |
| [openapi.yaml](./openapi.yaml) | Especificação OpenAPI 3.1 completa |
| [ARQUITETURA.md](./ARQUITETURA.md) | Como o sistema é construído por dentro |

## Docs navegáveis (Swagger UI)

Com o backend rodando em modo desenvolvimento:

```
http://localhost:3000/docs
```

(Desabilitado em produção por ora — `NODE_ENV=production` desliga a rota.)
