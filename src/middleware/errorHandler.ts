// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from "express";

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("💥 Erro global capturado:", err);
  res.status(err.status || 500).json({
    status: false,
    msg: err.message || "Erro interno no servidor.",
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined
  });
};
