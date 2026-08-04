// src/routes/v1/account.routes.ts
import { Router } from "express";
import { getAccount } from "../../controllers/v1/account.controller";

const router = Router();

router.get("/", getAccount);

export default router;
