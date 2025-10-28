"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
(async () => {
    try {
        const response = await axios_1.default.post("https://api.pagar.me/core/v5/orders", {
            items: [
                {
                    amount: 15990,
                    description: "Teste PIX via API v5",
                    quantity: 1,
                },
            ],
            customer: {
                name: "Cliente Teste",
                email: "cliente@teste.com",
                document: "12345678909",
                type: "individual",
            },
            payments: [
                {
                    payment_method: "pix",
                    pix: { expires_in: 3600 },
                },
            ],
            postback_url: "https://frederica-subtrochanteric-addilyn.ngrok-free.dev/api/transactions/webhook",
        }, {
            headers: {
                Authorization: `Basic ${Buffer.from(process.env.PAGARME_SECRET_KEY + ":").toString("base64")}`,
                "Content-Type": "application/json",
            },
        });
        console.log("✅ Pedido criado!");
        console.log(response.data);
    }
    catch (err) {
        console.error("❌ Erro ao criar pedido:", err.response?.data || err.message);
    }
})();
