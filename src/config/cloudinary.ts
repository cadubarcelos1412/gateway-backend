// src/config/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? "dbclkaipz",
  api_key: process.env.CLOUDINARY_API_KEY ?? "537365359421516",
  api_secret: process.env.CLOUDINARY_API_SECRET ?? "EmTpJiv6SS4hbtryd4xOO7wyztA",
  secure: true,
});

export { cloudinary };
