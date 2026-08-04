// src/routes/docs.routes.ts
import { Router } from "express";
import express from "express";
import path from "path";

const router = Router();

const docsSitePath = path.join(__dirname, "..", "..", "public", "docs-site");
const openapiPath = path.join(__dirname, "..", "..", "docs", "openapi.yaml");

// index.html cuida da navegação single-page; a spec crua também fica disponível para tooling.
router.use(express.static(docsSitePath));
router.get("/openapi.yaml", (_req, res) => res.sendFile(openapiPath));

export default router;
