"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyMasterToken = void 0;
const auth_1 = require("../config/auth");
/**
 * 🔐 Middleware para verificar token master
 * Protege rotas sensíveis do painel administrativo
 */
const verifyMasterToken = async (req, res, next) => {
    try {
        // Pega o token do header Authorization
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).json({
                status: false,
                message: "Token master não fornecido. Acesso negado.",
            });
            return;
        }
        // Remove "Bearer " se existir
        const token = authHeader.replace("Bearer ", "").trim();
        if (!token) {
            res.status(401).json({
                status: false,
                message: "Token master inválido. Acesso negado.",
            });
            return;
        }
        // Decodifica e valida o token
        const decoded = await (0, auth_1.decodeToken)(token);
        if (!decoded || decoded.role !== "master") {
            res.status(403).json({
                status: false,
                message: "Acesso negado: privilégios master necessários.",
            });
            return;
        }
        // Adiciona informações do usuário master no request
        req.user = decoded;
        // Continua para a próxima função
        next();
    }
    catch (error) {
        console.error("❌ Erro no middleware verifyMasterToken:", error);
        res.status(401).json({
            status: false,
            message: "Token master inválido ou expirado.",
        });
    }
};
exports.verifyMasterToken = verifyMasterToken;
