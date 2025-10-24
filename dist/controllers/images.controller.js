"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendFiles = exports.uploadFiles = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const UPLOADS_FOLDER = path_1.default.join(__dirname, "../files");
if (!fs_1.default.existsSync(UPLOADS_FOLDER)) {
    fs_1.default.mkdirSync(UPLOADS_FOLDER, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_FOLDER);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, uniqueName);
    },
});
const fileFilter = (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error("Apenas arquivos JPG, PNG ou PDF são permitidos"));
    }
};
const upload = (0, multer_1.default)({ storage, fileFilter });
exports.uploadFiles = upload.fields([
    { name: "image", maxCount: 1 },
]);
const sendFiles = async (req, res) => {
    try {
        const image = req.files["image"][0].filename;
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const path = `${baseUrl}/api/images/files/${image}`;
        return res.status(200).json({
            status: true,
            path,
        });
    }
    catch (error) {
        console.error("Error uploading image:", error);
        return res.status(500).json({ status: false, msg: "Internal Server Error" });
    }
};
exports.sendFiles = sendFiles;
