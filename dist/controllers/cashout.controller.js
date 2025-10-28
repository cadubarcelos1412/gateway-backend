"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectCashout = exports.approveCashout = exports.createCashout = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const cashout_service_1 = require("../services/cashout.service");
/**
 * 💸 Controller de Cashouts
 * - Criação, aprovação e rejeição de saques.
 */
/* -------------------------------------------------------------------------- */
/* 1️⃣ Criar solicitação de saque                                              */
/* -------------------------------------------------------------------------- */
const createCashout = async (req, res) => {
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const { userId, amount } = req.body;
        const cashout = await cashout_service_1.CashoutService.createCashout(new mongoose_1.default.Types.ObjectId(userId), amount, session);
        await session.commitTransaction();
        res.status(201).json({
            status: true,
            msg: "Solicitação de saque criada com sucesso.",
            cashout,
        });
    }
    catch (error) {
        await session.abortTransaction();
        console.error("❌ Erro em createCashout:", error);
        res.status(500).json({
            status: false,
            msg: error.message,
        });
    }
    finally {
        session.endSession();
    }
};
exports.createCashout = createCashout;
/* -------------------------------------------------------------------------- */
/* 2️⃣ Aprovar solicitação de saque                                            */
/* -------------------------------------------------------------------------- */
const approveCashout = async (req, res) => {
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const { cashoutId, adminId } = req.body;
        const result = await cashout_service_1.CashoutService.approveCashout(new mongoose_1.default.Types.ObjectId(cashoutId), new mongoose_1.default.Types.ObjectId(adminId), session);
        await session.commitTransaction();
        res.status(200).json({
            status: true,
            msg: "Saque aprovado e registrado no ledger.",
            result,
        });
    }
    catch (error) {
        await session.abortTransaction();
        console.error("❌ Erro em approveCashout:", error);
        res.status(500).json({
            status: false,
            msg: error.message,
        });
    }
    finally {
        session.endSession();
    }
};
exports.approveCashout = approveCashout;
/* -------------------------------------------------------------------------- */
/* 3️⃣ Rejeitar solicitação de saque                                           */
/* -------------------------------------------------------------------------- */
const rejectCashout = async (req, res) => {
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const { cashoutId, adminId, reason } = req.body;
        const result = await cashout_service_1.CashoutService.rejectCashout(new mongoose_1.default.Types.ObjectId(cashoutId), new mongoose_1.default.Types.ObjectId(adminId), reason, session);
        await session.commitTransaction();
        res.status(200).json({
            status: true,
            msg: "Saque rejeitado com sucesso.",
            result,
        });
    }
    catch (error) {
        await session.abortTransaction();
        console.error("❌ Erro em rejectCashout:", error);
        res.status(500).json({
            status: false,
            msg: error.message,
        });
    }
    finally {
        session.endSession();
    }
};
exports.rejectCashout = rejectCashout;
