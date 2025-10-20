import { Router, Request, Response, NextFunction } from "express";
import { upsertRetentionPolicy, listRetentionPolicies } from "../controllers/retentionPolicy.controller";
import { RetentionPolicy } from "../models/retentionPolicy.model";
import { decodeToken } from "../config/auth";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🛡️ Middleware – Apenas admin/master pode gerenciar políticas              */
/* -------------------------------------------------------------------------- */
const requireAdminOrMaster = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ status: false, msg: "Token ausente." });
      return;
    }

    const payload = await decodeToken(token);
    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({
        status: false,
        msg: "Acesso negado. Apenas admin ou master podem alterar políticas.",
      });
      return;
    }

    next();
  } catch (err) {
    console.error("❌ Erro em requireAdminOrMaster:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao validar permissões." });
    return;
  }
};

/* -------------------------------------------------------------------------- */
/* 📜 Listar todas as políticas                                               */
/* -------------------------------------------------------------------------- */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  await listRetentionPolicies(req, res);
});

/* -------------------------------------------------------------------------- */
/* 🆕 Criar ou atualizar política                                             */
/* -------------------------------------------------------------------------- */
router.post("/", requireAdminOrMaster, async (req: Request, res: Response): Promise<void> => {
  await upsertRetentionPolicy(req, res);
});

/* -------------------------------------------------------------------------- */
/* 🔍 Consultar uma política por ID                                          */
/* -------------------------------------------------------------------------- */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const policy = await RetentionPolicy.findById(req.params.id);
    if (!policy) {
      res.status(404).json({ status: false, msg: "Política não encontrada." });
      return;
    }
    res.status(200).json({ status: true, policy });
    return;
  } catch (error) {
    console.error("❌ Erro ao buscar política:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao buscar política." });
    return;
  }
});

/* -------------------------------------------------------------------------- */
/* ✏️ Atualizar política existente                                           */
/* -------------------------------------------------------------------------- */
router.put("/:id", requireAdminOrMaster, async (req: Request, res: Response): Promise<void> => {
  try {
    const updated = await RetentionPolicy.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      res.status(404).json({ status: false, msg: "Política não encontrada." });
      return;
    }
    res.status(200).json({
      status: true,
      msg: "Política atualizada com sucesso.",
      policy: updated,
    });
    return;
  } catch (error) {
    console.error("❌ Erro ao atualizar política:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao atualizar política." });
    return;
  }
});

/* -------------------------------------------------------------------------- */
/* 🗑️ Deletar política                                                        */
/* -------------------------------------------------------------------------- */
router.delete("/:id", requireAdminOrMaster, async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await RetentionPolicy.findByIdAndDelete(req.params.id);
    if (!deleted) {
      res.status(404).json({ status: false, msg: "Política não encontrada." });
      return;
    }
    res.status(200).json({ status: true, msg: "Política deletada com sucesso." });
    return;
  } catch (error) {
    console.error("❌ Erro ao deletar política:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao deletar política." });
    return;
  }
});

export default router;
