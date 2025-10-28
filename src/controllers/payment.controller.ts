import { Request, Response } from "express";
import axios from 'axios';
import { Transaction } from '../models/transaction.model';

export const createPixPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, customer, items, sellerId, userId } = req.body;

    // Validação
    if (!amount || !customer || !items || !sellerId) {
      res.status(400).json({
        success: false,
        message: 'Dados obrigatórios faltando: amount, customer, items, sellerId'
      });
      return;
    }

    console.log('📥 Criando pagamento PIX:', { amount, sellerId, userId });

    // Chama a API da Pagar.me v5
    const response = await axios.post(
      'https://api.pagar.me/core/v5/orders',
      {
        amount,
        currency: 'BRL',
        customer,
        items,
        payments: [{
          payment_method: 'pix',
          pix: {
            expires_in: 3600
          }
        }]
      },
      {
        auth: {
          username: process.env.PAGARME_SECRET_KEY || '',
          password: ''
        },
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const orderData = response.data;
    const charge = orderData.charges?.[0];
    const lastTransaction = charge?.last_transaction;
    
    console.log('✅ Resposta da Pagar.me:', {
      orderId: orderData.id,
      code: orderData.code,
      status: charge?.status
    });

    // Salva no banco de dados
    const transaction = new Transaction({
      externalId: orderData.code,
      orderId: orderData.id,
      chargeId: charge?.id,
      transactionId: lastTransaction?.id,
      gatewayId: lastTransaction?.gateway_id,
      sellerId,
      userId,
      amount: orderData.amount,
      method: 'pix',
      status: 'waiting_payment',
      pixData: {
        qrCode: lastTransaction?.qr_code,
        qrCodeUrl: lastTransaction?.qr_code_url,
        expiresAt: lastTransaction?.expires_at ? new Date(lastTransaction.expires_at) : undefined,
        pixProviderTid: lastTransaction?.pix_provider_tid,
      },
      purchaseData: {
        customer: {
          name: customer.name,
          email: customer.email,
          document: customer.document,
          documentType: customer.document_type,
          phone: customer.phones?.mobile_phone?.number,
        },
        products: items.map((item: any) => ({
          id: item.code,
          name: item.description,
          price: item.amount,
          quantity: item.quantity,
        })),
      },
    });

    await transaction.save();
    
    console.log('💾 Transação salva no MongoDB:', transaction._id);

    res.status(201).json({
      success: true,
      transaction: {
        id: transaction._id,
        code: orderData.code,
        qrCodeUrl: lastTransaction?.qr_code_url,
        qrCode: lastTransaction?.qr_code,
        expiresAt: lastTransaction?.expires_at,
        amount: orderData.amount,
        status: 'waiting_payment'
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao criar pagamento PIX:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar pagamento PIX',
      error: error.response?.data || error.message
    });
  }
};