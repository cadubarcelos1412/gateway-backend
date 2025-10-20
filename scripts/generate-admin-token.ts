import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const token = jwt.sign(
  {
    id: "68f10f38757f2ab14f38d970", // 🆔 ID do admin que você mostrou
    role: "admin",                 // 🔐 Permissão de administrador
  },
  process.env.SECRET_TOKEN as string,
  {
    expiresIn: "24h",
    issuer: process.env.ISSUER,
  }
);

console.log("Bearer Token:", token);
