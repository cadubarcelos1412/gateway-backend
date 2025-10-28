import { Request, Response } from "express";
import axios, { AxiosError } from "axios";

/** Tipagem esperada do corpo da requisição PIX */
interface PixPaymentRequest {
  amount: number;
  customer: {
    name: string;
    email: string;
    document: string;
  };
  items: {
    amount: number;
    description: string;
    quantity: number;
    code: string;
  }[];
}

/**
 * Cria um pagamento PIX via Pagar.me V5 (Core API)
 * Docs oficiais: https://docs.pagar.me/reference/criar-pagamento
 */
export async function createPixPayment(req: Request, res: Response): Promise<void> {
  try {
    const { amount, customer, items } = req.body as PixPaymentRequest;

    // 🔎 Validação básica de campos obrigatórios
    if (!amount || !customer?.document || !items?.length) {
      res.status(400).json({
        status: "error",
        message: "Campos obrigatórios ausentes: amount, customer.document ou items",
      });
      return;
    }

    console.log("💰 Criando PIX V5...", {
      valor: amount,
      cliente: customer.name,
      documento: customer.document,
    });

    // 🔗 Monta requisição para a Pagar.me V5
    const response = await axios.post(
      `${process.env.PAGARME_API_URL_V5}/orders`,
      {
        customer: {
          name: customer.name,
          email: customer.email,
          type: "individual",
          document: customer.document,
          document_type: "CPF",
          phones: {
            mobile_phone: {
              country_code: "55",
              area_code: "11",
              number: "999999999",
            },
          },
        },
        items: items.map((i) => ({
          amount: i.amount,
          description: i.description,
          quantity: i.quantity,
          code: i.code,
        })),
        payments: [
          {
            payment_method: "pix",
            pix: { expires_in: 3600 }, // expira em 1h
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAGARME_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000, // 15 segundos de timeout
      }
    );

    // 💾 Sucesso
    console.log("✅ PIX criado com sucesso:", response.data.id);

    res.status(201).json({
      status: "success",
      data: response.data,
    });
  } catch (error: unknown) {
    const err = error as AxiosError<any>;
    const message =
      err.response?.data?.message || err.response?.data || err.message;

    console.error("💥 Erro ao criar PIX V5:", message);

    res.status(500).json({
      status: "error",
      message,
      details: process.env.NODE_ENV === "development" ? err.response?.data : undefined,
    });
  }
}
