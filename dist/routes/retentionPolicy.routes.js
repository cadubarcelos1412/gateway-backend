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
            res.status(403).json({
                status: false,
                msg: "Acesso negado. Apenas admin ou master podem alterar políticas.",
            });
            return;
        }
        next();
    }
    catch (err) {
        console.error("❌ Erro em requireAdminOrMaster:", err);
        res.status(500).json({ status: false, msg: "Erro interno ao validar permissões." });
        return;
    }
};
/* -------------------------------------------------------------------------- */
/* 📜 Listar todas as políticas                                               */
/* -------------------------------------------------------------------------- */
router.get("/", async (req, res) => {
    await (0, retentionPolicy_controller_1.listRetentionPolicies)(req, res);
});
/* -------------------------------------------------------------------------- */
/* 🆕 Criar ou atualizar política                                             */
/* -------------------------------------------------------------------------- */
router.post("/", requireAdminOrMaster, async (req, res) => {
    await (0, retentionPolicy_controller_1.upsertRetentionPolicy)(req, res);
});
/* -------------------------------------------------------------------------- */
/* 🔍 Consultar uma política por ID                                          */
/* -------------------------------------------------------------------------- */
router.get("/:id", async (req, res) => {
    try {
        const policy = await retentionPolicy_model_1.RetentionPolicy.findById(req.params.id);
        if (!policy) {
            res.status(404).json({ status: false, msg: "Política não encontrada." });
            return;
        }
        res.status(200).json({ status: true, policy });
        return;
    }
    catch (error) {
        console.error("❌ Erro ao buscar política:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao buscar política." });
        return;
    }
});
/* -------------------------------------------------------------------------- */
/* ✏️ Atualizar política existente                                           */
/* -------------------------------------------------------------------------- */
router.put("/:id", requireAdminOrMaster, async (req, res) => {
    try {
        const updated = await retentionPolicy_model_1.RetentionPolicy.findByIdAndUpdate(req.params.id, req.body, { new: true });
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
    }
    catch (error) {
        console.error("❌ Erro ao atualizar política:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao atualizar política." });
        return;
    }
});
/* -------------------------------------------------------------------------- */
/* 🗑️ Deletar política                                                        */
/* -------------------------------------------------------------------------- */
router.delete("/:id", requireAdminOrMaster, async (req, res) => {
    try {
        const deleted = await retentionPolicy_model_1.RetentionPolicy.findByIdAndDelete(req.params.id);
        if (!deleted) {
            res.status(404).json({ status: false, msg: "Política não encontrada." });
            return;
        }
        res.status(200).json({ status: true, msg: "Política deletada com sucesso." });
        return;
    }
    catch (error) {
        console.error("❌ Erro ao deletar política:", error);
        res.status(500).json({ status: false, msg: "Erro interno ao deletar política." });
        return;
    }
});
exports.default = router;
