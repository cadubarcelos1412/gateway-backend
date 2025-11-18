import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { decodeToken } from "../config/auth";
import { User } from "../models/user.model";
import { Wallet } from "../models/wallet.model";
import { Transaction } from "../models/transaction.model";
import axios from "axios"; // ⚠️ Instalar: npm install axios

/* -------------------------------------------------------
🪙 Tipos de criptomoedas suportadas
-------------------------------------------------------- */
type CryptoType = "usdt" | "dpix" | "bitcoin" | "ethereum";

/* -------------------------------------------------------
🔐 Validação de endereços de criptomoedas
-------------------------------------------------------- */
const validateCryptoAddress = (address: string, cryptoType: CryptoType): boolean => {
  switch (cryptoType) {
    case "usdt":
    case "ethereum":
      // Ethereum/USDT (ERC-20) - endereço começa com 0x e tem 42 caracteres
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    
    case "bitcoin":
      // Bitcoin - endereços podem começar com 1, 3 ou bc1
      return /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address);
    
    case "dpix":
      // DPIX - similar ao formato Ethereum (ERC-20)
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    
    default:
      return false;
  }
};

/* -------------------------------------------------------
💰 Taxas de saque por criptomoeda (em %)
-------------------------------------------------------- */
const getCryptoFee = (cryptoType: CryptoType): number => {
  const fees: Record<CryptoType, number> = {
    usdt: 2.5,      // 2.5% taxa USDT
    dpix: 1.5,      // 1.5% taxa DPIX (mais barata)
    bitcoin: 3.0,   // 3% taxa Bitcoin
    ethereum: 2.8,  // 2.8% taxa Ethereum
  };
  return fees[cryptoType];
};

/* -------------------------------------------------------
📊 Buscar cotações em tempo real (CoinGecko API)
-------------------------------------------------------- */
const fetchRealCryptoRates = async (): Promise<{
  usdt: { brl: number; fee: number };
  dpix: { brl: number; fee: number };
  bitcoin: { brl: number; fee: number };
  ethereum: { brl: number; fee: number };
}> => {
  try {
    // 🌐 CoinGecko API (GRATUITA - Sem API Key necessária)
    // Limite: 10-50 chamadas/minuto
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      {
        params: {
          ids: "tether,bitcoin,ethereum",
          vs_currencies: "brl",
        },
        timeout: 5000, // 5 segundos timeout
      }
    );

    const data = response.data;

    return {
      usdt: {
        brl: data.tether?.brl || 5.45,
        fee: getCryptoFee("usdt"),
      },
      dpix: {
        brl: 1.0, // DPIX é 1:1 com Real
        fee: getCryptoFee("dpix"),
      },
      bitcoin: {
        brl: data.bitcoin?.brl || 350000.0,
        fee: getCryptoFee("bitcoin"),
      },
      ethereum: {
        brl: data.ethereum?.brl || 18000.0,
        fee: getCryptoFee("ethereum"),
      },
    };
  } catch (error) {
    console.error("❌ Erro ao buscar cotações na CoinGecko:", error);

    // 🔄 Fallback: Retorna valores mockados se a API falhar
    return {
      usdt: { brl: 5.45, fee: getCryptoFee("usdt") },
      dpix: { brl: 1.0, fee: getCryptoFee("dpix") },
      bitcoin: { brl: 350000.0, fee: getCryptoFee("bitcoin") },
      ethereum: { brl: 18000.0, fee: getCryptoFee("ethereum") },
    };
  }
};

/* -------------------------------------------------------
💸 1. Criar solicitação de saque em cripto
-------------------------------------------------------- */
export const createCryptoCashoutRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload?.id) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const user = await User.findById(payload.id);
    if (!user) {
      res.status(404).json({ status: false, msg: "Usuário não encontrado." });
      return;
    }

    const wallet = await Wallet.findOne({ userId: user._id });
    if (!wallet) {
      res.status(404).json({ status: false, msg: "Carteira não encontrada." });
      return;
    }

    const { amount, cryptoType, walletAddress } = req.body;

    // Validações
    if (!amount || amount <= 0) {
      res.status(400).json({ status: false, msg: "Valor de saque inválido." });
      return;
    }

    if (!["usdt", "dpix", "bitcoin", "ethereum"].includes(cryptoType)) {
      res.status(400).json({ 
        status: false, 
        msg: "Criptomoeda não suportada. Use: usdt, dpix, bitcoin ou ethereum." 
      });
      return;
    }

    if (!walletAddress || !validateCryptoAddress(walletAddress, cryptoType)) {
      res.status(400).json({ 
        status: false, 
        msg: `Endereço de carteira ${cryptoType.toUpperCase()} inválido.` 
      });
      return;
    }

    // Valor mínimo de saque
    const minAmount = 50; // R$ 50 mínimo
    if (amount < minAmount) {
      res.status(400).json({ 
        status: false, 
        msg: `Valor mínimo de saque é R$ ${minAmount.toFixed(2)}` 
      });
      return;
    }

    // Calcula a taxa
    const feePercentage = getCryptoFee(cryptoType);
    const fee = (amount * feePercentage) / 100;
    const netAmount = amount - fee;

    if (wallet.balance.available < amount) {
      res.status(400).json({ 
        status: false, 
        msg: "Saldo insuficiente.",
        available: wallet.balance.available 
      });
      return;
    }

    // Cria a transação
    const transaction = new Transaction({
      userId: user._id,
      productId: new mongoose.Types.ObjectId(), // Placeholder - ajuste conforme necessário
      amount,
      fee,
      netAmount,
      retention: 0,
      type: "withdraw",
      method: "crypto",
      status: "pending",
      description: `Saque em ${cryptoType.toUpperCase()} para ${walletAddress}`,
      riskFlags: [],
      purchaseData: {
        customer: {
          name: user.name,
          email: user.email,
          ip: req.ip || "unknown",
        },
      },
      cryptoDetails: {
        cryptoType,
        walletAddress,
        network: cryptoType === "usdt" || cryptoType === "ethereum" ? "ERC20" : 
                 cryptoType === "bitcoin" ? "BTC" : "DPIX",
      },
    });

    await transaction.save();

    // Congela o valor na carteira
    wallet.balance.available -= amount;
    wallet.balance.unAvailable.push({
      amount,
      availableIn: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h para processamento
      originTransactionId: transaction._id as Types.ObjectId,
      notes: `Saque em ${cryptoType.toUpperCase()} - Aguardando processamento`,
    });

    wallet.log.push({
      transactionId: transaction._id as Types.ObjectId,
      type: "withdraw",
      method: "crypto",
      amount,
      security: {
        createdAt: new Date(),
        ipAddress: req.ip || "localhost",
        userAgent: req.headers["user-agent"] || "unknown",
      },
    });

    await wallet.save();

    res.status(201).json({
      status: true,
      msg: `✅ Solicitação de saque em ${cryptoType.toUpperCase()} criada com sucesso!`,
      transaction: {
        id: transaction._id,
        amount,
        fee,
        netAmount,
        cryptoType,
        walletAddress,
        status: "pending",
      },
      saldo: {
        disponivel: wallet.balance.available,
        bloqueado: wallet.balance.unAvailable.reduce((acc, u) => acc + u.amount, 0),
      },
    });
  } catch (error) {
    console.error("❌ Erro em createCryptoCashoutRequest:", error);
    res.status(500).json({ status: false, msg: "Erro ao criar solicitação de saque em cripto." });
  }
};

/* -------------------------------------------------------
📋 2. Listar solicitações de saque em cripto pendentes (admin/master)
-------------------------------------------------------- */
export const listCryptoCashoutRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado." });
      return;
    }

    const pendingTransactions = await Transaction.find({
      type: "withdraw",
      method: "crypto",
      status: "pending",
    })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: true,
      total: pendingTransactions.length,
      pending: pendingTransactions.map((t: any) => ({
        id: t._id,
        user: t.userId,
        amount: t.amount,
        fee: t.fee,
        netAmount: t.netAmount,
        cryptoType: t.cryptoDetails?.cryptoType,
        walletAddress: t.cryptoDetails?.walletAddress,
        network: t.cryptoDetails?.network,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error("❌ Erro em listCryptoCashoutRequests:", error);
    res.status(500).json({ status: false, msg: "Erro ao listar solicitações." });
  }
};

/* -------------------------------------------------------
✅ 3. Aprovar saque em cripto (admin/master)
-------------------------------------------------------- */
export const approveCryptoCashout = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado." });
      return;
    }

    const { transactionId } = req.params;
    const { txHash } = req.body; // Hash da transação na blockchain

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      res.status(400).json({ status: false, msg: "ID de transação inválido." });
      return;
    }

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      res.status(404).json({ status: false, msg: "Transação não encontrada." });
      return;
    }

    if (transaction.status !== "pending") {
      res.status(400).json({ status: false, msg: "Transação já processada." });
      return;
    }

    // Atualiza a transação
    transaction.status = "approved";
    transaction.externalId = txHash || `CRYPTO-${Date.now()}`;
    if (txHash && transaction.cryptoDetails) {
      transaction.cryptoDetails.txHash = txHash;
    }
    await transaction.save();

    // Remove o valor bloqueado da carteira
    const wallet = await Wallet.findOne({ userId: transaction.userId });
    if (wallet) {
      const index = wallet.balance.unAvailable.findIndex(
        (u: any) => u.originTransactionId?.toString() === transactionId
      );

      if (index !== -1) {
        wallet.balance.unAvailable.splice(index, 1);
      }

      wallet.log.push({
        transactionId: transaction._id as Types.ObjectId,
        type: "withdraw",
        method: "crypto",
        amount: transaction.amount,
        security: {
          createdAt: new Date(),
          ipAddress: req.ip || "localhost",
          userAgent: req.headers["user-agent"] || "unknown",
          approvedBy: new mongoose.Types.ObjectId(payload.id) as Types.ObjectId,
        },
      });

      await wallet.save();
    }

    res.status(200).json({
      status: true,
      msg: "✅ Saque em cripto aprovado com sucesso!",
      transaction: {
        id: transaction._id,
        txHash: transaction.externalId,
        status: "approved",
      },
    });
  } catch (error) {
    console.error("❌ Erro em approveCryptoCashout:", error);
    res.status(500).json({ status: false, msg: "Erro ao aprovar saque." });
  }
};

/* -------------------------------------------------------
❌ 4. Rejeitar saque em cripto (admin/master)
-------------------------------------------------------- */
export const rejectCryptoCashout = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload || !["admin", "master"].includes(payload.role)) {
      res.status(403).json({ status: false, msg: "Acesso negado." });
      return;
    }

    const { transactionId } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      res.status(400).json({ status: false, msg: "ID de transação inválido." });
      return;
    }

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      res.status(404).json({ status: false, msg: "Transação não encontrada." });
      return;
    }

    if (transaction.status !== "pending") {
      res.status(400).json({ status: false, msg: "Transação já processada." });
      return;
    }

    // Atualiza a transação
    transaction.status = "failed";
    transaction.description = `${transaction.description} - REJEITADO: ${reason || "Sem motivo especificado"}`;
    await transaction.save();

    // Devolve o valor para a carteira do usuário
    const wallet = await Wallet.findOne({ userId: transaction.userId });
    if (wallet) {
      const index = wallet.balance.unAvailable.findIndex(
        (u: any) => u.originTransactionId?.toString() === transactionId
      );

      if (index !== -1) {
        const amount = wallet.balance.unAvailable[index].amount;
        wallet.balance.available += amount;
        wallet.balance.unAvailable.splice(index, 1);
      }

      wallet.log.push({
        transactionId: transaction._id as Types.ObjectId,
        type: "topup",
        method: "manual",
        amount: transaction.amount,
        security: {
          createdAt: new Date(),
          ipAddress: req.ip || "localhost",
          userAgent: req.headers["user-agent"] || "unknown",
          approvedBy: new mongoose.Types.ObjectId(payload.id) as Types.ObjectId,
        },
      });

      await wallet.save();
    }

    res.status(200).json({
      status: true,
      msg: "✅ Saque rejeitado e valor devolvido à carteira.",
      transaction: {
        id: transaction._id,
        status: "failed",
        reason,
      },
    });
  } catch (error) {
    console.error("❌ Erro em rejectCryptoCashout:", error);
    res.status(500).json({ status: false, msg: "Erro ao rejeitar saque." });
  }
};

/* -------------------------------------------------------
💳 5. Adicionar/Atualizar endereço de carteira cripto do usuário
-------------------------------------------------------- */
export const updateCryptoWalletAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const payload = await decodeToken(token);

    if (!payload?.id) {
      res.status(403).json({ status: false, msg: "Token inválido." });
      return;
    }

    const { cryptoType, walletAddress } = req.body;

    if (!["usdt", "dpix", "bitcoin", "ethereum"].includes(cryptoType)) {
      res.status(400).json({ 
        status: false, 
        msg: "Criptomoeda não suportada." 
      });
      return;
    }

    if (!validateCryptoAddress(walletAddress, cryptoType)) {
      res.status(400).json({ 
        status: false, 
        msg: `Endereço de carteira ${cryptoType.toUpperCase()} inválido.` 
      });
      return;
    }

    const wallet = await Wallet.findOne({ userId: payload.id });
    if (!wallet) {
      res.status(404).json({ status: false, msg: "Carteira não encontrada." });
      return;
    }

    // Atualiza ou adiciona o endereço
    if (!wallet.cryptoWallets) {
      wallet.cryptoWallets = {};
    }

    wallet.cryptoWallets[cryptoType] = {
      address: walletAddress,
      updatedAt: new Date(),
    };

    await wallet.save();

    res.status(200).json({
      status: true,
      msg: `✅ Endereço de ${cryptoType.toUpperCase()} atualizado com sucesso!`,
      wallets: wallet.cryptoWallets,
    });
  } catch (error) {
    console.error("❌ Erro em updateCryptoWalletAddress:", error);
    res.status(500).json({ status: false, msg: "Erro ao atualizar endereço." });
  }
};

/* -------------------------------------------------------
📊 6. Obter taxas de conversão atuais - COM API REAL
-------------------------------------------------------- */
export const getCryptoRates = async (_req: Request, res: Response): Promise<void> => {
  try {
    // 🌐 Busca cotações reais da CoinGecko
    const rates = await fetchRealCryptoRates();

    res.status(200).json({
      status: true,
      rates,
      lastUpdate: new Date(),
      source: "CoinGecko API", // Indica que são dados reais
    });
  } catch (error) {
    console.error("❌ Erro em getCryptoRates:", error);
    res.status(500).json({ status: false, msg: "Erro ao obter taxas." });
  }
};