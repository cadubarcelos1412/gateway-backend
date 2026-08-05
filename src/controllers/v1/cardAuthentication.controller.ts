// src/controllers/v1/cardAuthentication.controller.ts
import { Response } from "express";
import { ApiKeyRequest } from "../../middleware/authApiKey";
import { getZendryAccessToken } from "../../lib/zendry/client";

type ApiErrorType = "invalid_request_error" | "api_error";

function sendApiError(res: Response, status: number, type: ApiErrorType, code: string, message: string): void {
  res.status(status).json({ error: { type, code, message } });
}

/**
 * GET /v1/card_authentications/token
 *
 * Devolve o token Bearer da Zendry que o SDK client-side
 * (ZendrySDKThreeds.init_threeds, https://cdn.zendry.com/v1/zendry-sdk-threeds.min.js)
 * precisa pra rodar o desafio 3DS no navegador do comprador — o SDK cria a
 * própria sessão 3DS sozinho (POST /v1/card_payments/threeds) usando esse
 * token, não há como o backend criar a sessão antecipadamente.
 *
 * ATENÇÃO — esse token fica exposto no navegador do comprador do INTEGRADOR
 * (não só no checkout da PYX Gate). É o mesmo token que autentica TODAS as
 * chamadas da PYX Gate na Zendry, não escopado só pra 3DS — decisão
 * consciente, aceita explicitamente pelo dono do projeto. Chamar essa rota
 * exige uma chave de API válida (sk_...) — não é um endpoint aberto.
 *
 * Só funciona para sellers com adquirente "zendry".
 */
export const getCardAuthenticationToken = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const acquirerKey = (req.merchant as any)?.acquirer || "pagarme";
  if (acquirerKey !== "zendry") {
    sendApiError(
      res,
      400,
      "invalid_request_error",
      "acquirer_not_supported",
      `Autenticação 3DS via /v1/card_authentications só é suportada para sellers com adquirente "zendry". Adquirente atual: "${acquirerKey}".`
    );
    return;
  }

  try {
    const token = await getZendryAccessToken();
    res.status(200).json({ token });
  } catch (error: any) {
    console.error("❌ Erro em getCardAuthenticationToken (/v1/card_authentications/token):", error);
    sendApiError(res, 502, "api_error", "threeds_token_failed", error?.message || "Erro ao obter token da adquirente.");
  }
};
