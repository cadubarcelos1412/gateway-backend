import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

(async () => {
  try {
    const response = await axios.post(
      "https://api.pagar.me/core/v5/orders",
      {
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
        postback_url:
          "https://frederica-subtrochanteric-addilyn.ngrok-free.dev/api/transactions/webhook",
      },
      {
        headers: {
          Authorization: `Basic ${Buffer.from(process.env.PAGARME_SECRET_KEY + ":").toString("base64")}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Pedido criado!");
    console.log(response.data);
  } catch (err: any) {
    console.error("❌ Erro ao criar pedido:", err.response?.data || err.message);
  }
})();
