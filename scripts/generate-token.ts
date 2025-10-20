import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

// ⚠️ Use sempre o user._id aqui, não o seller._id
const token = jwt.sign(
  {
    id: "68f131eb52d8f49bcaab5a6f", // <- userId, não sellerId
    role: "seller"
  },
  process.env.SECRET_TOKEN as string,
  {
    expiresIn: "24h",
    issuer: process.env.ISSUER,
  }
);

console.log("Bearer Token:", token);
