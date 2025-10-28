"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinary = void 0;
// src/config/cloudinary.ts
const cloudinary_1 = require("cloudinary");
Object.defineProperty(exports, "cloudinary", { enumerable: true, get: function () { return cloudinary_1.v2; } });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? "dbclkaipz",
    api_key: process.env.CLOUDINARY_API_KEY ?? "537365359421516",
    api_secret: process.env.CLOUDINARY_API_SECRET ?? "EmTpJiv6SS4hbtryd4xOO7wyztA",
    secure: true,
});
