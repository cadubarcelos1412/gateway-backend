import { Request, Response, NextFunction } from "express";
import { decodeToken } from "../config/auth";

/**
 * 🔒 Middleware genérico — só exige um JWT válido (qualquer role). Criado
 * na auditoria de segurança de 2026-08-30 especificamente pra rodar ANTES
 * do multer nas rotas de upload (KYC, invoice de wire, imagem de checkout):
 * sem isso, o multer grava o arquivo em disco ANTES de qualquer checagem de
 * autenticação, permitindo abuso (DoS de disco, upload anônimo) mesmo numa
 * rota cujo CONTROLLER já checa auth — o dano (disco ocupado) já aconteceu
 * antes do controller rodar. Não substitui a checagem de dono/role feita
 * dentro de cada controller (ex.: isOwner || isMaster) — só barra requisição
 * totalmente anônima o mais cedo possível.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
  const payload = await decodeToken(token);
  if (!payload) {
    res.status(401).json({ status: false, msg: "Não autorizado." });
    return;
  }
  next();
}
