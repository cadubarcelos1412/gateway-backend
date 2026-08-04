// src/controllers/apiKey.controller.ts
import { Request, Response } from "express";
import { decodeToken } from "../config/auth";
import { Seller } from "../models/seller.model";
import { ApiKey, ApiKeyMode, ApiKeyType } from "../models/apiKey.model";
import { generateApiKey } from "../utils/apiKeys";

/**
 * Resolve o Seller dono do JWT do dashboard. Segue o mesmo padrão manual
 * (decodeToken + Seller.findOne) usado no resto do codebase — não existe
 * um middleware/req.user compartilhado para reaproveitar.
 */
async function getAuthSeller(req: Request, res: Response) {
  const rawToken = req.headers.authorization?.replace("Bearer ", "");
  if (!rawToken) {
    res.status(401).json({ status: false, msg: "Token ausente." });
    return null;
  }

  const payload = await decodeToken(rawToken);
  if (!payload?.id) {
    res.status(401).json({ status: false, msg: "Token inválido." });
    return null;
  }

  const seller = await Seller.findOne({ userId: payload.id });
  if (!seller) {
    res.status(404).json({ status: false, msg: "Seller não encontrado para este usuário." });
    return null;
  }

  return seller;
}

const VALID_TYPES: ApiKeyType[] = ["secret", "publishable"];
const VALID_MODES: ApiKeyMode[] = ["test", "live"];

/**
 * POST /api/developers/api-keys
 * Cria uma nova chave. A chave completa só é retornada aqui, uma única vez.
 */
export const createApiKey = async (req: Request, res: Response): Promise<void> => {
  const seller = await getAuthSeller(req, res);
  if (!seller) return;

  try {
    const { name, type, mode } = req.body ?? {};

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ status: false, msg: "Informe um nome/apelido para a chave." });
      return;
    }
    if (!VALID_TYPES.includes(type)) {
      res.status(400).json({ status: false, msg: "Tipo inválido. Use 'secret' ou 'publishable'." });
      return;
    }
    if (!VALID_MODES.includes(mode)) {
      res.status(400).json({ status: false, msg: "Modo inválido. Use 'test' ou 'live'." });
      return;
    }

    const generated = generateApiKey(type, mode);

    const apiKey = await ApiKey.create({
      merchantId: seller._id,
      name: name.trim(),
      type,
      mode,
      keyPrefix: generated.keyPrefix,
      last4: generated.last4,
      hashedKey: generated.hashedKey,
      scopes: ["*"],
    });

    res.status(201).json({
      status: true,
      msg: "Chave criada com sucesso. Copie agora — ela não será exibida novamente.",
      apiKey: {
        ...apiKey.toJSON(),
        key: generated.fullKey, // única vez que a chave completa aparece
      },
    });
  } catch (err) {
    console.error("❌ Erro em createApiKey:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao criar chave de API." });
  }
};

/**
 * GET /api/developers/api-keys
 * Lista as chaves do seller autenticado (nunca a chave completa/hash).
 */
export const listApiKeys = async (req: Request, res: Response): Promise<void> => {
  const seller = await getAuthSeller(req, res);
  if (!seller) return;

  try {
    const apiKeys = await ApiKey.find({ merchantId: seller._id }).sort({ createdAt: -1 });
    res.status(200).json({ status: true, apiKeys: apiKeys.map((k) => k.toJSON()) });
  } catch (err) {
    console.error("❌ Erro em listApiKeys:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao listar chaves de API." });
  }
};

/**
 * POST /api/developers/api-keys/:id/revoke
 */
export const revokeApiKey = async (req: Request, res: Response): Promise<void> => {
  const seller = await getAuthSeller(req, res);
  if (!seller) return;

  try {
    const apiKey = await ApiKey.findOne({ _id: req.params.id, merchantId: seller._id });
    if (!apiKey) {
      res.status(404).json({ status: false, msg: "Chave não encontrada." });
      return;
    }
    if (apiKey.revokedAt) {
      res.status(200).json({ status: true, msg: "Chave já estava revogada.", apiKey: apiKey.toJSON() });
      return;
    }

    apiKey.revokedAt = new Date();
    await apiKey.save();

    res.status(200).json({ status: true, msg: "Chave revogada.", apiKey: apiKey.toJSON() });
  } catch (err) {
    console.error("❌ Erro em revokeApiKey:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao revogar chave." });
  }
};

/**
 * POST /api/developers/api-keys/:id/rotate
 * Cria uma chave nova (mesmo nome/tipo/modo) e revoga a antiga, atomicamente.
 */
export const rotateApiKey = async (req: Request, res: Response): Promise<void> => {
  const seller = await getAuthSeller(req, res);
  if (!seller) return;

  try {
    const oldKey = await ApiKey.findOne({ _id: req.params.id, merchantId: seller._id });
    if (!oldKey) {
      res.status(404).json({ status: false, msg: "Chave não encontrada." });
      return;
    }
    if (oldKey.revokedAt) {
      res.status(400).json({ status: false, msg: "Não é possível rotacionar uma chave já revogada." });
      return;
    }

    const generated = generateApiKey(oldKey.type, oldKey.mode);

    const newKey = await ApiKey.create({
      merchantId: seller._id,
      name: oldKey.name,
      type: oldKey.type,
      mode: oldKey.mode,
      keyPrefix: generated.keyPrefix,
      last4: generated.last4,
      hashedKey: generated.hashedKey,
      scopes: oldKey.scopes,
    });

    oldKey.revokedAt = new Date();
    await oldKey.save();

    res.status(201).json({
      status: true,
      msg: "Chave rotacionada. Copie a nova chave agora — ela não será exibida novamente.",
      apiKey: {
        ...newKey.toJSON(),
        key: generated.fullKey,
      },
      revokedKeyId: oldKey.id,
    });
  } catch (err) {
    console.error("❌ Erro em rotateApiKey:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao rotacionar chave." });
  }
};
