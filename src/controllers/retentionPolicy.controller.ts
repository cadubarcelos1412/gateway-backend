import { Request, Response } from "express";
import { RetentionPolicy } from "../models/retentionPolicy.model";

/* -------------------------------------------------------
🆕 Criar ou atualizar política de retenção por risco
-------------------------------------------------------- */
export const upsertRetentionPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("📥 Body recebido:", req.body); // 👈 debug obrigatório

    let { method, riskLevel, percentage, days, active, description } = req.body;

    // ✅ 1. Validação de campos obrigatórios
    if (
      !method ||
      !riskLevel ||
      percentage === undefined ||
      days === undefined
    ) {
      res.status(400).json({
        status: false,
        msg: "Campos obrigatórios: 'method', 'riskLevel', 'percentage' e 'days'.",
      });
      return;
    }

    // ✅ 2. Normalização – evita erros por capitalização ou formato
    method = method.toLowerCase().trim();
    if (method === "creditcard") method = "credit_card";

    riskLevel = riskLevel.toLowerCase().trim();

    // ✅ 3. Sanitização e fallback
    percentage = Number(percentage);
    days = Number(days);
    active = active !== undefined ? Boolean(active) : true;

    // ✅ 4. Validação de valores
    const validMethods = ["pix", "credit_card", "boleto"];
    if (!validMethods.includes(method)) {
      res.status(400).json({ status: false, msg: "Método inválido. Use: pix, credit_card ou boleto." });
      return;
    }

    const validRiskLevels = ["low", "medium", "high"];
    if (!validRiskLevels.includes(riskLevel)) {
      res.status(400).json({ status: false, msg: "Nível de risco inválido. Use: low, medium ou high." });
      return;
    }

    if (isNaN(percentage) || isNaN(days)) {
      res.status(400).json({ status: false, msg: "'percentage' e 'days' devem ser números." });
      return;
    }

    if (percentage < 0 || days < 0) {
      res.status(400).json({ status: false, msg: "Valores de 'percentage' e 'days' devem ser positivos." });
      return;
    }

    // ✅ 5. Cria ou atualiza a política específica
    const policy = await RetentionPolicy.findOneAndUpdate(
      { method, riskLevel },
      { percentage, days, active, description },
      { new: true, upsert: true }
    );

    res.status(200).json({
      status: true,
      msg: `✅ Política de retenção (${riskLevel}) para '${method}' salva com sucesso.`,
      policy,
    });
  } catch (error: any) {
    console.error("❌ Erro ao salvar política:", error?.message || error);
    res.status(500).json({
      status: false,
      msg: "Erro interno ao salvar política de retenção.",
      error: error?.message || "Unknown error",
    });
  }
};

/* -------------------------------------------------------
📜 Listar todas as políticas de retenção
-------------------------------------------------------- */
export const listRetentionPolicies = async (_req: Request, res: Response): Promise<void> => {
  try {
    const policies = await RetentionPolicy.find().sort({ method: 1, riskLevel: 1 }).lean();

    res.status(200).json({
      status: true,
      count: policies.length,
      policies,
    });
  } catch (error: any) {
    console.error("❌ Erro ao listar políticas:", error?.message || error);
    res.status(500).json({
      status: false,
      msg: "Erro interno ao listar políticas.",
    });
  }
};

/* -------------------------------------------------------
❌ Remover política de retenção
-------------------------------------------------------- */
export const deleteRetentionPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const { method, riskLevel } = req.body;

    if (!method || !riskLevel) {
      res.status(400).json({ status: false, msg: "Informe 'method' e 'riskLevel' para remover." });
      return;
    }

    const policy = await RetentionPolicy.findOneAndDelete({ method, riskLevel });
    if (!policy) {
      res.status(404).json({ status: false, msg: "Política não encontrada." });
      return;
    }

    res.status(200).json({
      status: true,
      msg: `✅ Política de retenção (${riskLevel}) para '${method}' removida com sucesso.`,
    });
  } catch (error: any) {
    console.error("❌ Erro ao remover política:", error?.message || error);
    res.status(500).json({
      status: false,
      msg: "Erro interno ao remover política de retenção.",
    });
  }
};
