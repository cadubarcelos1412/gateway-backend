"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const retentionPolicy_controller_1 = require("../controllers/retentionPolicy.controller");
const retentionPolicy_model_1 = require("../models/retentionPolicy.model");
const auth_1 = require("../config/auth");
const router = (0, express_1.Router)();
/* -------------------------------------------------------------------------- */
/* 🛡️ Middleware – Apenas admin/master pode gerenciar políticas              */
/* -------------------------------------------------------------------------- */
const requireAdminOrMaster = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        if (!token) {
            res.status(401).json({ status: false, msg: "Token ausente." });
            return;
        }
        const payload = await (0, auth_1.decodeToken)(token);
        if (!payload || !["admin", "master"].includes(payload.role)) {
            res.status(403).json({ status: false, msg: "Acesso negado. Apenas admin ou master podem alterar políticas." });
            return;
        }
        next();
    }
    catch (err) {
        console.error("❌ Erro em requireAdminOrMaster:", err);
        res.status(500).json({ status: false, msg: "Erro interno ao validar permissões." });
    }
};
/* -------------------------------------------------------------------------- */
/* 🧪 Validação de ID no parâmetro                                           */
/* -------------------------------------------------------------------------- */
const validatePolicyId = (req, res, next) => {
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
router.get("/", retentionPolicy_controller_1.listRetentionPolicies);
/* -------------------------------------------------------------------------- */
/* 🆕 POST – Criar ou atualizar política                                     */
/* -------------------------------------------------------------------------- */
router.post("/", requireAdminOrMaster, retentionPolicy_controller_1.upsertRetentionPolicy);
/* -------------------------------------------------------------------------- */
/* 🔍 GET – Consultar uma política por ID                                    */
/* -------------------------------------------------------------------------- */
router.get("/:id", validatePolicyId, async (req, res) => {
    try {
        const policy = await retentionPolicy_model_1.RetentionPolicy.findById(req.params.id);
        if (!policy) {
            res.status(404).json({ status: false, msg: "Política não encontrada." });
            return;
        }
        res.status(200).json({ status: true, policy });
    }
    catch (error) {
        console.error("❌ Erro ao buscar política:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao buscar política." });
    }
});
/* -------------------------------------------------------------------------- */
/* ✏️ PUT – Atualizar política por ID                                        */
/* -------------------------------------------------------------------------- */
router.put("/:id", requireAdminOrMaster, validatePolicyId, async (req, res) => {
    try {
        const updated = await retentionPolicy_model_1.RetentionPolicy.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updated) {
            res.status(404).json({ status: false, msg: "Política não encontrada." });
            return;
        }
        res.status(200).json({ status: true, msg: "Política atualizada com sucesso.", policy: updated });
    }
    catch (error) {
        console.error("❌ Erro ao atualizar política:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao atualizar política." });
    }
});
/* -------------------------------------------------------------------------- */
/* 🗑️ DELETE – Deletar política por ID                                       */
/* -------------------------------------------------------------------------- */
router.delete("/:id", requireAdminOrMaster, validatePolicyId, async (req, res) => {
    try {
        const deleted = await retentionPolicy_model_1.RetentionPolicy.findByIdAndDelete(req.params.id);
        if (!deleted) {
            res.status(404).json({ status: false, msg: "Política não encontrada." });
            return;
        }
        res.status(200).json({ status: true, msg: "Política deletada com sucesso." });
    }
    catch (error) {
        console.error("❌ Erro ao deletar política:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao deletar política." });
    }
});
/* -------------------------------------------------------------------------- */
/* 🗑️ POST – Deletar por método + risco (modo alternativo)                   */
/* -------------------------------------------------------------------------- */
router.post("/delete", requireAdminOrMaster, async (req, res) => {
    try {
        const { method, riskLevel } = req.body;
        if (!method || !riskLevel) {
            res.status(400).json({
                status: false,
                msg: "Campos obrigatórios: 'method' e 'riskLevel'.",
            });
            return;
        }
        const deleted = await retentionPolicy_model_1.RetentionPolicy.findOneAndDelete({ method, riskLevel });
        if (!deleted) {
            res.status(404).json({ status: false, msg: "Política não encontrada." });
            return;
        }
        res.status(200).json({
            status: true,
            msg: `Política de retenção (${riskLevel}) para '${method}' removida com sucesso.`,
        });
    }
    catch (error) {
        console.error("❌ Erro ao remover política:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao remover política." });
    }
});
/* -------------------------------------------------------------------------- */
/* 🔥 DELETE – Resetar todas as políticas (somente dev/admin)                */
/* -------------------------------------------------------------------------- */
router.delete("/reset/all", requireAdminOrMaster, async (_req, res) => {
    try {
        const result = await retentionPolicy_model_1.RetentionPolicy.deleteMany({});
        res.status(200).json({
            status: true,
            msg: `Todas as políticas foram apagadas. (${result.deletedCount} removidas)`,
        });
    }
    catch (error) {
        console.error("❌ Erro ao resetar políticas:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao resetar políticas." });
    }
});
exports.default = router;
