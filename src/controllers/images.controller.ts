import { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { decodeToken } from "../config/auth";

const UPLOADS_FOLDER = path.join(__dirname, "../files");
if (!fs.existsSync(UPLOADS_FOLDER)) {
    fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_FOLDER);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, uniqueName);
    },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Apenas arquivos JPG, PNG ou PDF são permitidos"));
    }
};

// 🔒 Limite de tamanho (achado de auditoria de segurança 2026-08-30): sem
// isso, dava pra mandar um arquivo gigante e encher o disco do container.
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

export const uploadFiles = upload.fields([
    { name: "image", maxCount: 1 },
]);

/**
 * 🔒 Achado CRÍTICO/ALTO em auditoria de segurança (2026-08-30): este
 * endpoint aceitava upload de QUALQUER requisição anônima e servia o
 * resultado publicamente — dava pra usar o domínio da PyxGate como
 * hospedeiro grátis de arquivo (phishing/malware). Usado de verdade só pra
 * customização de checkout/link de pagamento (CheckoutBuilder,
 * PaymentLinkForm — sempre dentro do painel autenticado do seller), então
 * exigir login não quebra nenhum uso legítimo.
 *
 * Roda ANTES do multer na rota (ver images.routes.ts) — de propósito: se a
 * checagem ficasse dentro de `sendFiles`, o multer já teria gravado o
 * arquivo em disco antes de qualquer validação de auth, exatamente o mesmo
 * problema achado nos outros uploads (KYC, invoice de wire) na mesma
 * auditoria.
 */
export const requireAuthForUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);
    if (!payload) {
        res.status(401).json({ status: false, msg: "Não autorizado." });
        return;
    }
    next();
};

export const sendFiles = async (req: Request, res: Response) => {
    try {
        const image = (req.files as { [fieldname: string]: Express.Multer.File[] })["image"][0].filename;
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const path = `${baseUrl}/api/images/files/${image}`;

        return res.status(200).json({
            status: true,
            path,
        });
    } catch (error) {
        console.error("Error uploading image:", error);
        return res.status(500).json({ status: false, msg: "Internal Server Error" });
    }
};

