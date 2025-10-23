import { Router } from "express";
import { releaseReserve } from "../controllers/reserve.controller";

const router = Router();

/**
 * @route POST /api/reserve/release
 * @desc Libera manualmente reservas de risco (somente master)
 * @access Restrito (Bearer Token com role=master)
 */
router.post("/release", releaseReserve);

export default router;
