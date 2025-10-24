"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (err, _req, res, _next) => {
    console.error("💥 Erro global capturado:", err);
    res.status(err.status || 500).json({
        status: false,
        msg: err.message || "Erro interno no servidor.",
        stack: process.env.NODE_ENV !== "production" ? err.stack : undefined
    });
};
exports.errorHandler = errorHandler;
