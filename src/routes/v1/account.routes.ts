// src/routes/v1/account.routes.ts
import { Router } from "express";
import { getAccount } from "../../controllers/v1/account.controller";
import { requireScope } from "../../middleware/requireScope";

const router = Router();

router.get("/", requireScope("account:read"), getAccount);

export default router;
