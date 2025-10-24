import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/database";
import routes from "./routes";
import swaggerUi from "swagger-ui-express";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swaggerFile = require("../swagger-output.json");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

connectDB();
app.use("/api", routes);

// 📘 Documentação Swagger
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));

app.get("/", (_req: Request, res: Response) => {
  res.status(200).send("🚀 API do Gateway rodando com sucesso!");
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`📘 Documentação disponível em: http://localhost:${PORT}/docs`);
});
