"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const images_controller_1 = require("../controllers/images.controller");
const router = express_1.default.Router();
router.use("/files", express_1.default.static(path_1.default.join(__dirname, "../files")));
router.post("/upload", images_controller_1.uploadFiles, (req, res) => { (0, images_controller_1.sendFiles)(req, res); });
exports.default = router;
