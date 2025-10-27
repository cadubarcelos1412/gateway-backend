"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const database_1 = require("./config/database");
const routes_1 = __importDefault(require("./routes"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swaggerFile = require("../swagger-output.json");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
(0, database_1.connectDB)();
app.use("/api", routes_1.default);
// 📘 Documentação Swagger
app.use("/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerFile));
app.get("/", (_req, res) => {
    res.status(200).send("🚀 API do Gateway rodando com sucesso!");
});
app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`📘 Documentação disponível em: http://localhost:${PORT}/docs`);
});
