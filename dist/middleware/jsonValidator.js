"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonValidator = void 0;
const jsonValidator = (err, _req, res, _next) => {
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
exports.jsonValidator = jsonValidator;
