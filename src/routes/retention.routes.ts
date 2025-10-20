import { Router, Request, Response, NextFunction } from "express";
import { upsertRetentionPolicy, listRetentionPolicies } from "../controllers/retentionPolicy.controller";
import { RetentionPolicy } from "../models/retentionPolicy.model";
import { decodeToken } from "../config/auth";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🛡️ Middleware – Apenas admin/master pode gerenciar políticas              */
/* -------------------------------------------------------------------------- */
const requireAdminOrMaster = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ status: false, msg: "Token ausente." });
      return;
    }

    const payload = await decodeToken(token);
    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado. Apenas admin ou master podem alterar políticas." });
      return;
    }

    next();
  } catch (err) {
    console.error("❌ Erro em requireAdminOrMaster:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao validar permissões." });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧪 Validação de ID no parâmetro                                           */
/* -------------------------------------------------------------------------- */
const validatePolicyId = (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  if (!id || !/^[a-f\d]{24}$/i.test(id)) {
    res.status(400).json({ status: false, msg: "ID de política inválido." });
    return;
  }
  next();
};

/* -------------------------------------------------------------------------- */
/* 📜 GET – Listar todas as políticas                                        */
/* -------------------------------------------------------------------------- */
router.get("/", listRetentionPolicies);

/* -------------------------------------------------------------------------- */
/* 🆕 POST – Criar ou atualizar política                                     */
/* -------------------------------------------------------------------------- */
router.post("/", requireAdminOrMaster, upsertRetentionPolicy);

/* -------------------------------------------------------------------------- */
/* 🔍 GET – Consultar uma política por ID                                    */
/* -------------------------------------------------------------------------- */
router.get("/:id", validatePolicyId, async (req: Request, res: Response) => {
  try {
    const policy = await RetentionPolicy.findById(req.params.id);
    if (!policy) {
      res.status(404).json({ status: false, msg: "Política não encontrada." });
      return;
    }
    res.status(200).json({ status: true, policy });
  } catch (error) {
    console.error("❌ Erro ao buscar política:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar política." });
  }
});

/* -------------------------------------------------------------------------- */
/* ✏️ PUT – Atualizar política por ID                                        */
/* -------------------------------------------------------------------------- */
router.put("/:id", requireAdminOrMaster, validatePolicyId, async (req: Request, res: Response) => {
  try {
    const updated = await RetentionPolicy.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      res.status(404).json({ status: false, msg: "Política não encontrada." });
      return;
    }
    res.status(200).json({ status: true, msg: "Política atualizada com sucesso.", policy: updated });
  } catch (error) {
    console.error("❌ Erro ao atualizar política:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar política." });
  }
});

/* -------------------------------------------------------------------------- */
/* 🗑️ DELETE – Deletar política por ID                                       */
/* -------------------------------------------------------------------------- */
router.delete("/:id", requireAdminOrMaster, validatePolicyId, async (req: Request, res: Response) => {
  try {
    const deleted = await RetentionPolicy.findByIdAndDelete(req.params.id);
    if (!deleted) {
      res.status(404).json({ status: false, msg: "Política não encontrada." });
      return;
    }
    res.status(200).json({ status: true, msg: "Política deletada com sucesso." });
  } catch (error) {
    console.error("❌ Erro ao deletar política:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao deletar política." });
  }
});

/* -------------------------------------------------------------------------- */
/* 🗑️ POST – Deletar por método + risco (modo alternativo)                   */
/* -------------------------------------------------------------------------- */
router.post("/delete", requireAdminOrMaster, async (req: Request, res: Response) => {
  try {
    const { method, riskLevel } = req.body;

    if (!method || !riskLevel) {
      res.status(400).json({
        status: false,
        msg: "Campos obrigatórios: 'method' e 'riskLevel'.",
      });
      return;
    }

    const deleted = await RetentionPolicy.findOneAndDelete({ method, riskLevel });
    if (!deleted) {
      res.status(404).json({ status: false, msg: "Política não encontrada." });
      return;
    }

    res.status(200).json({
      status: true,
      msg: `Política de retenção (${riskLevel}) para '${method}' removida com sucesso.`,
    });
  } catch (error) {
    console.error("❌ Erro ao remover política:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao remover política." });
  }
});

/* -------------------------------------------------------------------------- */
/* 🔥 DELETE – Resetar todas as políticas (somente dev/admin)                */
/* -------------------------------------------------------------------------- */
router.delete("/reset/all", requireAdminOrMaster, async (_req: Request, res: Response) => {
  try {
    const result = await RetentionPolicy.deleteMany({});
    res.status(200).json({
      status: true,
      msg: `Todas as políticas foram apagadas. (${result.deletedCount} removidas)`,
    });
  } catch (error) {
    console.error("❌ Erro ao resetar políticas:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao resetar políticas." });
  }
});

export default router;
