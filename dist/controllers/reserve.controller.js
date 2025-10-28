"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseReserve = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../config/auth");
const releaseReserve_service_1 = require("../services/releaseReserve.service");
/* -------------------------------------------------------------------------- */
/* 🔓 Liberação manual de reserva técnica (somente MASTER)                    */
/* -------------------------------------------------------------------------- */
const releaseReserve = async (req, res) => {
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        if (!token) {
            res.status(403).json({ status: false, msg: "Token ausente." });
            return;
        }
        const payload = await (0, auth_1.decodeToken)(token);
        if (payload?.role !== "master") {
            res.status(403).json({
                status: false,
                msg: "Acesso negado. Apenas usuários MASTER podem liberar reservas.",
            });
            return;
        }
        const { sellerId, amount, reason } = req.body;
        if (!sellerId || !amount) {
            res.status(400).json({ status: false, msg: "Campos obrigatórios: sellerId e amount." });
            return;
        }
        const result = await releaseReserve_service_1.ReleaseReserveService.releaseReserve(new mongoose_1.default.Types.ObjectId(sellerId), Number(amount), reason || "Liberação manual de reserva técnica", session);
        await session.commitTransaction();
        res.status(200).json({
            status: true,
            msg: "✅ Reserva liberada com sucesso.",
            data: {
                sellerId,
                amount: result.amount,
            },
        });
    }
    catch (error) {
        await session.abortTransaction();
        console.error("❌ Erro em releaseReserve:", error);
        res.status(500).json({
            status: false,
            msg: error.message || "Erro interno ao liberar reserva.",
        });
    }
    finally {
        session.endSession();
    }
};
exports.releaseReserve = releaseReserve;
