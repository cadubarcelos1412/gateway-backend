"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const product_controller_1 = require("../controllers/product.controller");
const router = (0, express_1.Router)();
/* -------------------------------------------------------
📦 ROTAS DE PRODUTOS
Prefixo base: /api/products
-------------------------------------------------------- */
/**
 * 🆕 Criar um novo produto vinculado ao usuário autenticado
 * @route   POST /api/products/create
 * @access  Privado (necessário token)
 */
router.post("/create", async (req, res) => {
    await (0, product_controller_1.createProduct)(req, res);
});
/**
 * 🗑️ Deletar um produto existente pelo nome
 * @route   DELETE /api/products/delete
 * @access  Privado (necessário token)
 */
router.delete("/delete", async (req, res) => {
    await (0, product_controller_1.deleteProduct)(req, res);
});
/**
 * ✏️ Editar dados de um produto existente
 * @route   PATCH /api/products/edit
 * @access  Privado (necessário token)
 */
router.patch("/edit", async (req, res) => {
    await (0, product_controller_1.editProduct)(req, res);
});
/**
 * 🔍 Buscar produto por ID
 * @route   GET /api/products/get?id=<ID_DO_PRODUTO>
 * @access  Público
 */
router.get("/get", async (req, res) => {
    await (0, product_controller_1.getProduct)(req, res);
});
exports.default = router;
