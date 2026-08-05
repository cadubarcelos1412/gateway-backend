# Autenticação

## Tipos de chave

| Prefixo | Tipo | Onde usar |
|---|---|---|
| `sk_live_...` / `sk_test_...` | **Secret key** | Só no seu backend. Autoriza todas as operações da API. |
| `pk_live_...` / `pk_test_...` | **Publishable key** | Pode aparecer em código de frontend. Hoje não autentica nenhum endpoint de `/v1` — reservada para SDKs client-side futuros (ex.: tokenização de cartão). |

**Nunca coloque uma secret key em código de frontend, app mobile ou
repositório público.** Se isso acontecer, revogue a chave imediatamente no
dashboard e gere uma nova.

## Como autenticar

Envie a secret key no header `Authorization`:

```
Authorization: Bearer sk_test_51H8x...
```

```bash
curl https://pyxgate-api.onrender.com/v1/account \
  -H "Authorization: Bearer sk_test_51H8x..."
```

Requisições sem chave, com chave inválida ou revogada recebem `401`:

```json
{
  "error": {
    "type": "authentication_error",
    "code": "invalid_api_key",
    "message": "Chave de API inválida."
  }
}
```

## Gerando uma chave

1. No dashboard, acesse **Desenvolvedores**.
2. Clique em **Nova chave**, escolha nome, tipo (secret/publishable) e modo (teste/produção).
3. Copie a chave exibida — **ela só aparece uma vez**. Se perder, revogue e crie outra.

## Revogação e rotação

- **Revogar**: invalida a chave imediatamente. Qualquer integração que a use passa a receber `401`. Não há como reverter — é definitivo.
- **Rotacionar**: cria uma chave nova (mesmo nome/tipo/modo) e revoga a antiga na mesma operação. Use quando suspeitar de vazamento sem querer interromper o serviço por completo — mas note que a chave antiga para de funcionar imediatamente, então atualize sua integração antes ou logo depois de rotacionar.

Boas práticas: rotacione chaves periodicamente, use uma chave por
integração/ambiente (não compartilhe a mesma chave entre sistemas
diferentes) e revogue chaves de integrações descontinuadas.

## Modo teste vs. produção

O modo (`test`/`live`) é uma propriedade da chave, não um parâmetro da
requisição. Uma chave `sk_test_...` cria e só enxerga pagamentos em modo
teste; uma chave `sk_live_...` só opera com dinheiro real. Veja
[introducao.md](./introducao.md#ambientes-test-vs-live).
