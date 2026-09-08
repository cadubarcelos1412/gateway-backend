# Erros

Toda resposta de erro da API segue o mesmo formato:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "amount_invalid",
    "message": "amount deve ser um inteiro positivo, em centavos.",
    "param": "amount"
  }
}
```

- `type` — categoria do erro (veja tabela abaixo).
- `code` — identificador específico, estável, para tratar programaticamente.
- `message` — descrição legível (pt-BR), não parseie por conteúdo — use `code`.
- `param` — quando o erro é de validação, indica o campo problemático (pode ser ausente).

## Types

| Type | HTTP status típico | Significado |
|---|---|---|
| `invalid_request_error` | 400, 404 | Payload inválido, parâmetro faltando, recurso não encontrado, transição de estado inválida. |
| `authentication_error` | 401 | Chave de API ausente, inválida ou revogada. |
| `card_error` | 400 | Falha relacionada ao processamento do cartão na adquirente (reservado — hoje falhas de adquirente aparecem como `invalid_request_error` / `payment_creation_failed`, ver nota abaixo). |
| `api_error` | 429, 500 | Erro do nosso lado (rate limit, erro interno) — não é culpa do seu payload. |

## Códigos conhecidos

| Code | Type | Quando acontece |
|---|---|---|
| `missing_api_key` | authentication_error | Header `Authorization` ausente ou não começa com `Bearer sk_`. |
| `invalid_api_key` | authentication_error | Chave não existe. |
| `revoked_api_key` | authentication_error | Chave foi revogada. |
| `merchant_not_found` | authentication_error | Chave válida, mas o merchant associado não existe mais (raro). |
| `invalid_payload` | invalid_request_error | Corpo da requisição não passou na validação (Zod). |
| `amount_below_minimum` | invalid_request_error | Pix abaixo de R$ 5,00 — limite observado do lado da adquirente (não documentado oficialmente), pode mudar. |
| `payment_creation_failed` | invalid_request_error | Falha ao criar o pagamento — inclui recusas da adquirente em modo live. |
| `self_payment_not_allowed` | invalid_request_error | `customer.document` é o mesmo CPF/CNPJ cadastrado como vendedor da conta — pagamento pra si mesmo não é permitido. |
| `customer_data_incomplete` | invalid_request_error | Faltou `customer.email` + `customer.document` (ou, em Pix, `customer.phone` como alternativa). |
| `pix_phone_only_not_authorized` | invalid_request_error | Enviou só `customer.phone` (sem email/document) num Pix, mas esta conta ainda não foi autorizada pela PYX Gate pra esse modo — fale com o suporte ou envie email+document. |
| `kyc_not_approved` | invalid_request_error | O seller ainda não teve a verificação de identidade (KYC) aprovada — precisa enviar os documentos e aguardar aprovação antes de processar pagamentos reais. |
| `wrong_mode` | invalid_request_error | Tentou simular pagamento (`/test/payments/...`) usando uma chave `live`. |
| `invalid_status_transition` | invalid_request_error | Tentou simular um pagamento que não está mais `pending` (já foi pago/falhou). |
| `idempotency_key_reused` | invalid_request_error | Mesma `Idempotency-Key` usada com um payload diferente. |
| `not_found` | invalid_request_error | Pagamento ou webhook endpoint não encontrado (ou não pertence à sua conta). |
| `not_implemented` | invalid_request_error | Recurso ainda não disponível (hoje: `/v1/refunds`). |
| `rate_limit_exceeded` | api_error | Mais de 100 requisições/minuto com a mesma chave. |
| `internal_error` | api_error | Erro inesperado do nosso lado. Se persistir, é um bug nosso. |

## Nota sobre `card_error`

O type `card_error` está reservado na especificação para recusas
específicas da adquirente (cartão negado, CVV inválido, saldo insuficiente
etc.). Hoje, qualquer falha na criação do pagamento — incluindo recusas de
adquirente — retorna `invalid_request_error` / `payment_creation_failed`
com a mensagem de erro repassada. Isso pode ficar mais granular no futuro
sem quebrar compatibilidade (o `type` só ficaria mais específico).
