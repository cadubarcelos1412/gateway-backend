// src/controllers/v1/account.controller.ts
import { Response } from "express";
import { ApiKeyRequest } from "../../middleware/authApiKey";

/**
 * GET /v1/account
 * Endpoint mínimo só para validar autenticação por API key de ponta a ponta.
 * Os recursos reais da API pública (payments, webhook_endpoints) são
 * escopo da Etapa 3.
 */
export const getAccount = async (req: ApiKeyRequest, res: Response): Promise<void> => {
  const merchant = req.merchant!;

  res.status(200).json({
    id: `acct_${merchant.id}`,
    name: merchant.name,
    email: merchant.email,
    mode: req.apiKeyMode,
    kyc_status: merchant.kycStatus,
  });
};
