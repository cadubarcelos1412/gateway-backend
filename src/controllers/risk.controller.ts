import { Request, Response } from "express";

/**
 * 🧠 Lista regras antifraude configuradas
 */
export const getRiskRules = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rules = [
      { code: "HIGH_AMOUNT", description: "Valor acima do limite seguro" },
      { code: "FOREIGN_IP", description: "Transação vinda de IP suspeito" },
      { code: "NO_KYC", description: "Seller sem KYC aprovado" },
      { code: "FAILED_ATTEMPT", description: "Tentativa anterior de fraude" },
    ];

    res.status(200).json({
      status: true,
      rules,
    });
  } catch (error) {
    console.error("❌ Erro em getRiskRules:", error);
    res.status(500).json({ status: false, msg: "Erro ao buscar regras de risco." });
  }
};

/**
 * ⚡ Dispara análise antifraude manual
 */
export const triggerRiskEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) {
      res.status(400).json({ status: false, msg: "transactionId é obrigatório." });
      return;
    }

    // (simulação – aqui você integraria com RiskEngine)
    console.log(`🔍 Analisando risco da transação ${transactionId}...`);

    res.status(200).json({
      status: true,
      msg: `Análise antifraude disparada para transação ${transactionId}.`,
    });
  } catch (error) {
    console.error("❌ Erro em triggerRiskEvent:", error);
    res.status(500).json({ status: false, msg: "Erro ao executar evento de risco." });
  }
};
