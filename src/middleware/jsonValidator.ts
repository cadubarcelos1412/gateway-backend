// src/middleware/jsonValidator.ts
import { Request, Response, NextFunction } from "express";

export const jsonValidator = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      status: false,
      msg: "❌ JSON malformado. Verifique aspas, vírgulas e acentos no corpo da requisição."
    });
  }
  return res.status(500).json({
    status: false,
    msg: "❌ Erro interno inesperado no parser JSON.",
    detalhe: process.env.NODE_ENV !== "production" ? err.message : undefined
  });
};
