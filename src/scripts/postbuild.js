import fs from "fs";
import path from "path";

const swaggerPath = path.resolve("swagger-output.json");
const distPath = path.resolve("dist/swagger-output.json");

if (fs.existsSync(swaggerPath)) {
  fs.copyFileSync(swaggerPath, distPath);
  console.log("📘 Swagger file copied to dist/");
} else {
  console.log("⚠️  Swagger file not found — skipping copy (safe to ignore).");
}
